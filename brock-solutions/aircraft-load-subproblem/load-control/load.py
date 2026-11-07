"""
Weight Load Balancing Optimizer

Optimizes cargo loaded while stil adhering to a plane's weight and balance plan (WAB)
Main eqn: min|total moment - (total weight * target CG)|
Method: Mixed Integer Linear Progreamming (MILP)

Requirements:
- pulp
"""

import pulp

# default unassigned penalty factor is 1000 to heavily prioritize loading as much cargo as possible
def solve_cargo_loading_plan(cargo_database, aircraft_params, unassigned_penalty_factor = 1000.0):
    """
    solves for optimal cargo distribution to meet WAB
    params: 
        cargo_database (list of dicts): sorted list of cargo items in dict format {'id': C1, 'weight', 1500}
        aircraft params (dict): aircraft structural specifications, limits, etc.
        unassigned_penalty_factor (float): penalty weight per pound of unassigned cargo 
                                           (higher value prioritizes loading cargo over perfect cg matching)
    """

    # initialize optimization problem
    prob = pulp.LpProblem("Aircraft_Cargo_WAB", pulp.LpMinimize)

    # get structural limits
    bays = aircraft_params['bays'] # dict containing arm, weight cap, and volume limits
    oew = aircraft_params['oew'] # operating empty weight (lbs)
    oew_arm = aircraft_params['oew_arm'] # arm of operating empty weight (inches), h-distance from datum to CG
    max_zfw = aircraft_params['max_zfw'] # max zero fuel weight (lbs)

    target_cg = aircraft_params['target_cg']

    num_items = len(cargo_database)
    bay_ids = list(bays.keys())

    # define decision vars 
    # z[i, j] = 1 if cargo i is loaded into bay j, else 0

    z = pulp.LpVariable.dicts("assign", ((i,j) for i in range(num_items) for j in bay_ids), cat = 'Binary')

    # vars to set abs deviation from target moment
    # necessary bc opitimization solvers cannot handle abs val functions due to sharp corners produced that are non-linear
    # these solvers are made to 

    dev_pos = pulp.LpVariable("Moment_Dev_Pos", lowBound = 0, cat = 'Continuous')
    dev_neg = pulp.LpVariable("Moment_Dev_Neg", lowBound = 0, cat = 'Continuous')

    # define objective function: to minimize total deviation from target cg + small penalty for unassigned cargo
    unassigned_weight_penalty = pulp.lpSum(
        (1 - pulp.lpSum(z[i, j] for j in bay_ids)) * cargo_database[i]['weight'] * unassigned_penalty_factor
        for i in range(num_items)
    )

    prob += dev_pos + dev_neg + unassigned_weight_penalty, "Minimize_CG_Deviation_and_Unassigned_Cargo"

    # define constraints
    # note that += is overridden in the pulp lib to add constraints instead of numerically adding to left var

    # CONSTRAINT A: every cargo item can be assigned to at most 1 cargo bay
    for i in range(num_items):
        prob += pulp.lpSum(z[i, j] for j in bay_ids) <= 1, f"Max_One_Bay_Item{cargo_database[i]['id']}"

    # CONSTRAINT B: compartment weight limits
    for j in bay_ids:
        prob += pulp.lpSum(z[i,j] * cargo_database[i]['weight'] for i in range(num_items)) <= bays[j]['max_weight'], f"Weight_Cap_Bay_{j}"

    # CONSTRAINT C: max zero fuel weight of aircraft
    total_cargo_weight = pulp.lpSum(z[i,j] * cargo_database[i]['weight'] for i in range(num_items) for j in bay_ids)
    prob  += (oew + total_cargo_weight) <= max_zfw, "Max_Zero_Fuel_Weight"

    # CONSTRAINT D: Abs. value formulation for CG deviation
    # we want: total+moment - total_weight * target_cg = dev_pos - dev_neg

    total_weight = oew + total_cargo_weight

    oew_moment = oew + oew_arm
    cargo_moment = pulp.lpSum(z[i,j] * cargo_database[i]['weight'] * bays[j]['arm'] for i in range(num_items) for j in bay_ids)
    total_moment = oew_moment + cargo_moment

    # linearized constraint
    prob += total_moment - (total_weight * target_cg) == dev_pos - dev_neg, "Linearized_CG_Deviation"

    # solve optimization problem
    solver = pulp.PULP_CBC_CMD(msg = False)
    status = prob.solve(solver)


    # parse and return reuslts
    results = {
        'status': pulp.LpStatus[status],
        'assignments': {j: [] for j in bay_ids},
        'bay_totals': {j: {'weight': 0, 'items': 0} for j in bay_ids},
        'unassigned': []
    }
    
    if pulp.LpStatus[status] == "Optimal":
        for i in range(num_items):
            assigned = False
            for j in bay_ids:
                if pulp.value(z[i,j]) == 1:
                    results['assignments'][j].append(cargo_database[i])
                    results['bay_totals'][j]['weight'] += cargo_database[i]['weight']
                    results['bay_totals'][j]['items'] += 1
                    assigned = True
                    break
            if not assigned:
                results['unassigned'].append(cargo_database[i])

        # calculate final WAB stats
        final_cargo_weight = sum(results['bay_totals'][j]['weight'] for j in bay_ids)
        final_cargo_moment = sum(results['bay_totals'][j]['weight'] * bays[j]['arm'] for j in bay_ids)
        
        results['metrics'] = {
            'total_weight': oew + final_cargo_weight,
            'final_cg': (oew_moment + final_cargo_moment) / (oew + final_cargo_weight),
            'target_cg': target_cg,
            'deviation_inches': abs(((oew_moment + final_cargo_moment) / (oew + final_cargo_weight)) - target_cg)
        }
        
    return results


# example scenario:
# sorted database of invoming cargo (heaviest first) with 2 extra heavy items (CRG-011 and CRG-012)
# will intentionall exceed structural weight capacities, forcing solver to choose what to leave behind

if __name__ == "__main__":
    cargo_db = [
        {"id": "CRG-001", "weight": 2800, "desc": "Heavy Machinery Parts"},
        {"id": "CRG-002", "weight": 2400, "desc": "Industrial Valves"},
        {"id": "CRG-011", "weight": 4000, "desc": "Generator Unit (Overload item)"}, # overweight
        {"id": "CRG-012", "weight": 3500, "desc": "Steel Piping (Overload item)"},  # overweight
        {"id": "CRG-003", "weight": 1800, "desc": "E-Commerce Pallet A"},
        {"id": "CRG-004", "weight": 1500, "desc": "E-Commerce Pallet B"},
        {"id": "CRG-005", "weight": 1100, "desc": "Perishable Foods"},
        {"id": "CRG-006", "weight": 950,  "desc": "Medical Equipment"},
        {"id": "CRG-007", "weight": 800,  "desc": "Aircraft Spare Parts"},
        {"id": "CRG-008", "weight": 550,  "desc": "Mail Sacks"},
        {"id": "CRG-009", "weight": 400,  "desc": "Diplomatic Cargo"},
        {"id": "CRG-010", "weight": 200,  "desc": "Lithium Batteries (Declared)"},
    ]

    # aircraft specs
    b737_specs = {
        'oew': 112550,          # Operating Empty Weight (lbs) including passengers on this flight
        'oew_arm': 652.5,       # Empty Weight Arm (inches)
        'max_zfw': 138300,      # Max Zero Fuel Weight limit (lbs) - allows max 25,750 lbs of cargo
        'target_cg': 650.0,     # Perfect target CG centroid (inches) to optimize fuel efficiency
        'bays': {
            'FWD_HOLD': {
                'arm': 410.0,       # Forward cargo bay is far forward of CG
                'max_weight': 8500  # Structural load limit of FWD bay
            },
            'AFT_HOLD': {
                'arm': 910.0,       # Aft cargo bay is far rear of CG
                'max_weight': 9200  # Structural load limit of AFT bay
            }
        }
    }   

    # start of test
    
    print("--- Running MILP Optimization Solver for Aircraft Cargo Loading")

    plan = solve_cargo_loading_plan(cargo_db, b737_specs, unassigned_penalty_factor=1000.0)
    
    print(f"Optimization Status: {plan['status']}\n")
    
    if plan['status'] == "Optimal":
        metrics = plan['metrics']
        print(f"Target CG:    {metrics['target_cg']:.2f} inches")
        print(f"Calculated CG:{metrics['final_cg']:.2f} inches")
        print(f"Deviation:    {metrics['deviation_inches']:.4f} inches")
        print(f"Total weight: {metrics['total_weight']:,} lbs (Max ZFW: {b737_specs['max_zfw']:,} lbs)\n")
        
        for bay, data in plan['bay_totals'].items():
            print(f"=== {bay} ===")
            print(f"  Total Weight: {data['weight']} lbs (Capacity: {b737_specs['bays'][bay]['max_weight']} lbs)")
            print(f"  Item Count:   {data['items']}")
            print("  Assigned Cargo:")
            for item in plan['assignments'][bay]:
                print(f"    - {item['id']}: {item['weight']} lbs ({item['desc']})")
            print()
            
        print("=== UNASSIGNED CARGO (Left Behind) ===")
        if plan['unassigned']:
            total_left = sum(item['weight'] for item in plan['unassigned'])
            print(f"  Total Weight: {total_left} lbs")
            for item in plan['unassigned']:
                print(f"    - {item['id']}: {item['weight']} lbs ({item['desc']})")
        else:
            print("  None! All cargo was successfully loaded.")
        print()
    else:
        print("Could not find an optimal balance loading plan within safe operational limits.")
        