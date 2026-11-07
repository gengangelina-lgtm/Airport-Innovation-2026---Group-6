from flask import Flask, render_template, request, jsonify
import pulp

app = Flask(__name__)

def solve_loading_plan(manifest, aircraft_params, unassigned_penalty_factor=1000.0):
    """
    Solves for optimal cargo & passenger distribution to meet WAB using MILP (PuLP)
    """
    prob = pulp.LpProblem("Aircraft_WAB_Optimizer", pulp.LpMinimize)

    zones = aircraft_params['zones']
    oew = float(aircraft_params['oew'])
    oew_arm = float(aircraft_params['oew_arm'])
    max_zfw = float(aircraft_params['max_zfw'])
    target_cg = float(aircraft_params['target_cg'])

    num_items = len(manifest)
    zone_ids = list(zones.keys())

    if num_items == 0:
        return {
            'status': 'Optimal',
            'assignments': {j: [] for j in zone_ids},
            'zone_totals': {j: {'weight': 0, 'items': 0} for j in zone_ids},
            'unassigned': [],
            'metrics': {
                'total_weight': oew,
                'final_cg': oew_arm,
                'target_cg': target_cg,
                'deviation_inches': abs(oew_arm - target_cg)
            }
        }

    # Generate valid assignment pairs (Cargo -> Holds, Passengers -> Cabins)
    valid_pairs = []
    for i in range(num_items):
        item_id = manifest[i]['id'].upper()
        for j in zone_ids:
            if manifest[i]['type'] == zones[j]['type']:
                # STRICT CLAUSE: Enforce passenger class separation rules
                if j == 'FWD_CABIN' and 'ECON' in item_id:
                    continue  # Do not allow Economy blocks in the Business Cabin
                if j == 'AFT_CABIN' and 'BIZ' in item_id:
                    continue  # Do not allow Business blocks in the Economy Cabin
                    
                valid_pairs.append((i, j))

    # Decision variables
    z = pulp.LpVariable.dicts("assign", valid_pairs, cat='Binary')

    # Continuous variables for absolute deviation from target moment
    dev_pos = pulp.LpVariable("Moment_Dev_Pos", lowBound=0, cat='Continuous')
    dev_neg = pulp.LpVariable("Moment_Dev_Neg", lowBound=0, cat='Continuous')

    # Objective Function: Minimize unassigned items AND CG deviation
    unassigned_weight_penalty = pulp.lpSum(
        (1 - pulp.lpSum(z[i, j] for j in zone_ids if (i, j) in valid_pairs)) * float(manifest[i]['weight']) * unassigned_penalty_factor
        for i in range(num_items)
    )
    prob += dev_pos + dev_neg + unassigned_weight_penalty, "Minimize_CG_Deviation_and_Unassigned"

    # CONSTRAINT A: Max one zone per manifest item
    for i in range(num_items):
        valid_zones_for_i = [j for j in zone_ids if (i, j) in valid_pairs]
        if valid_zones_for_i:
            prob += pulp.lpSum(z[i, j] for j in valid_zones_for_i) <= 1, f"Max_One_Zone_Item_{i}"

    # CONSTRAINT B & C: Zone weight limits and seat limits (if applicable)
    for j in zone_ids:
        valid_items_for_j = [i for i in range(num_items) if (i, j) in valid_pairs]
        
        # Max Weight Constraint
        prob += pulp.lpSum(z[i, j] * float(manifest[i]['weight']) for i in valid_items_for_j) <= float(zones[j]['max_weight']), f"Weight_Cap_Zone_{j}"
        
        # Max Seats Constraint (Passenger Cabins only)
        if 'max_seats' in zones[j] and zones[j]['max_seats'] is not None:
            prob += pulp.lpSum(z[i, j] * int(manifest[i].get('count', 1)) for i in valid_items_for_j) <= int(zones[j]['max_seats']), f"Seat_Cap_Zone_{j}"

    # CONSTRAINT D: Max Zero Fuel Weight
    total_payload_weight = pulp.lpSum(z[i, j] * float(manifest[i]['weight']) for (i, j) in valid_pairs)
    prob += (oew + total_payload_weight) <= max_zfw, "Max_Zero_Fuel_Weight"

    # CONSTRAINT E: Linearized absolute value calculation for CG deviation
    oew_moment = oew * oew_arm 
    payload_moment = pulp.lpSum(z[i, j] * float(manifest[i]['weight']) * float(zones[j]['arm']) for (i, j) in valid_pairs)
    
    total_weight = oew + total_payload_weight
    total_moment = oew_moment + payload_moment

    prob += total_moment - (total_weight * target_cg) == dev_pos - dev_neg, "Linearized_CG_Deviation"

    # Solve optimization problem
    solver = pulp.PULP_CBC_CMD(msg=False)
    status = prob.solve(solver)

    # Format Results
    results = {
        'status': pulp.LpStatus[status],
        'assignments': {j: [] for j in zone_ids},
        'zone_totals': {j: {'weight': 0, 'items': 0} for j in zone_ids},
        'unassigned': []
    }

    if pulp.LpStatus[status] == "Optimal":
        for i in range(num_items):
            assigned = False
            for j in zone_ids:
                if (i, j) in valid_pairs and pulp.value(z[i, j]) == 1:
                    results['assignments'][j].append(manifest[i])
                    results['zone_totals'][j]['weight'] += int(manifest[i]['weight'])
                    results['zone_totals'][j]['items'] += int(manifest[i].get('count', 1))
                    assigned = True
                    break
            if not assigned:
                results['unassigned'].append(manifest[i])

        final_payload_weight = sum(results['zone_totals'][j]['weight'] for j in zone_ids)
        final_payload_moment = sum(results['zone_totals'][j]['weight'] * float(zones[j]['arm']) for j in zone_ids)
        
        actual_total_weight = oew + final_payload_weight
        actual_final_cg = (oew_moment + final_payload_moment) / actual_total_weight if actual_total_weight > 0 else 0

        results['metrics'] = {
            'total_weight': actual_total_weight,
            'final_cg': actual_final_cg,
            'target_cg': target_cg,
            'deviation_inches': abs(actual_final_cg - target_cg)
        }
    
    return results

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/optimize', methods=['POST'])
def optimize():
    data = request.json
    manifest = data.get('manifest', [])
    aircraft_params = data.get('aircraft_params', {})
    
    result = solve_loading_plan(manifest, aircraft_params)
    return jsonify(result)

if __name__ == '__main__':
    app.run(debug=True, port=5000)