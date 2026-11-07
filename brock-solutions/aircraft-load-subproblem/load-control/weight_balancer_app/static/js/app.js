// Initial seed manifest scaled to match a Boeing 787-8 Commercial Payload flight
let manifestDatabase = [
    // --- Passenger Section (Group Blocks matching standard airline allowances) ---
    {"id": "PAX-BIZ-A",   "type": "passenger", "weight": 4600,  "count": 20,  "desc": "Business Class Block A"},
    {"id": "PAX-BIZ-B",   "type": "passenger", "weight": 5750,  "count": 25,  "desc": "Business Class Block B"},
    {"id": "PAX-ECON-1",  "type": "passenger", "weight": 11500, "count": 50,  "desc": "Economy Zone 1 Rows 10-25"},
    {"id": "PAX-ECON-2",  "type": "passenger", "weight": 13800, "count": 60,  "desc": "Economy Zone 2 Rows 26-40"},
    {"id": "PAX-ECON-3",  "type": "passenger", "weight": 16100, "count": 70,  "desc": "Economy Zone 3 Rows 41-55"},
    
    // --- Cargo Lower Deck ULD Pallets/Containers Section ---
    {"id": "ULD-CRG-001", "type": "cargo",     "weight": 8500,  "count": 1,   "desc": "Heavy Automotive Assembly Machinery"},
    {"id": "ULD-CRG-002", "type": "cargo",     "weight": 6200,  "count": 1,   "desc": "Perishable Fresh Seafood Logistics"},
    {"id": "ULD-CRG-003", "type": "cargo",     "weight": 9100,  "count": 1,   "desc": "Industrial Castings & Steel Valves"},
    {"id": "ULD-CRG-004", "type": "cargo",     "weight": 5400,  "count": 1,   "desc": "E-Commerce Express Cargo Container 1"},
    {"id": "ULD-CRG-005", "type": "cargo",     "weight": 5200,  "count": 1,   "desc": "E-Commerce Express Cargo Container 2"},
    {"id": "ULD-CRG-006", "type": "cargo",     "weight": 3100,  "count": 1,   "desc": "Medical Equipment & Supplies"},
    {"id": "ULD-CRG-007", "type": "cargo",     "weight": 4000,  "count": 1,   "desc": "International Mail Priority Sacks"}
];

function renderManifestTable() {
    const tbody = document.getElementById('manifestTableBody');
    tbody.innerHTML = '';
    manifestDatabase.forEach((item, index) => {
        const row = document.createElement('tr');
        const badgeColor = item.type === 'passenger' ? 'var(--pax-light)' : 'var(--primary-light)';
        
        row.innerHTML = `
            <td><strong>${item.id}</strong></td>
            <td style="color: ${badgeColor}; text-transform: capitalize; font-size: 0.8rem;">${item.type}</td>
            <td>${parseInt(item.weight).toLocaleString()} lbs</td>
            <td>${item.count}</td>
            <td><small>${item.desc}</small></td>
            <td><button class="btn-danger" style="padding: 0.2rem 0.4rem; font-size: 0.75rem;" onclick="deleteManifestItem(${index})">Delete</button></td>
        `;
        tbody.appendChild(row);
    });
}

function addManifestItem() {
    const id = document.getElementById('newId').value.trim();
    const type = document.getElementById('newType').value;
    const weight = parseInt(document.getElementById('newWeight').value);
    const count = parseInt(document.getElementById('newQty').value);
    const desc = document.getElementById('newDesc').value.trim();
    
    if(!id || isNaN(weight) || isNaN(count) || !desc) {
        alert("Please confirm all inputs contain valid parameters.");
        return;
    }
    
    manifestDatabase.push({id, type, weight, count, desc});
    renderManifestTable();
    
    showToast(`✅ Successfully added ${id} (${weight.toLocaleString()} lbs)`);
    
    document.getElementById('newId').value = '';
    document.getElementById('newWeight').value = '';
    document.getElementById('newQty').value = '1';
    document.getElementById('newDesc').value = '';
}

function showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 400); 
    }, 3000); 
}

function deleteManifestItem(index) {
    manifestDatabase.splice(index, 1);
    renderManifestTable();
}

async function runBackendOptimization() {
    // Build Zone Logic structure encompassing both Passenger Cabins & Cargo Holds
    const aircraft_params = {
        oew: parseFloat(document.getElementById('oew').value),
        oew_arm: parseFloat(document.getElementById('oew_arm').value),
        max_zfw: parseFloat(document.getElementById('max_zfw').value),
        target_cg: parseFloat(document.getElementById('target_cg').value),
        zones: {
            FWD_CABIN: {
                arm: parseFloat(document.getElementById('fwd_cab_arm').value),
                max_weight: parseFloat(document.getElementById('fwd_cab_max').value),
                max_seats: parseInt(document.getElementById('fwd_cab_seats').value),
                type: 'passenger'
            },
            AFT_CABIN: {
                arm: parseFloat(document.getElementById('aft_cab_arm').value),
                max_weight: parseFloat(document.getElementById('aft_cab_max').value),
                max_seats: parseInt(document.getElementById('aft_cab_seats').value),
                type: 'passenger'
            },
            FWD_HOLD: {
                arm: parseFloat(document.getElementById('fwd_arm').value),
                max_weight: parseFloat(document.getElementById('fwd_max').value),
                type: 'cargo'
            },
            AFT_HOLD: {
                arm: parseFloat(document.getElementById('aft_arm').value),
                max_weight: parseFloat(document.getElementById('aft_max').value),
                type: 'cargo'
            }
        }
    };

    const statusBox = document.getElementById('mStatusBox');
    const statusVal = document.getElementById('mStatus');
    statusVal.innerText = "Computing...";
    statusBox.className = "metric-box";

    try {
        const response = await fetch('/api/optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ manifest: manifestDatabase, aircraft_params: aircraft_params })
        });

        if (!response.ok) throw new Error("Server communication fault event.");
        const plan = await response.json();

        if (plan.status !== "Optimal") {
            statusVal.innerText = plan.status;
            statusBox.className = "metric-box status-infeasible";
            alert("Solver could not reach an optimal WAB solution matching structural requirements.");
            return;
        }

        // Render validation text fields
        statusVal.innerText = "Optimal";
        statusBox.className = "metric-box status-optimal";
        document.getElementById('mWeight').innerText = `${plan.metrics.total_weight.toLocaleString()} lbs`;
        document.getElementById('mCG').innerText = `${plan.metrics.final_cg.toFixed(2)}"`;
        document.getElementById('mDev').innerText = `${plan.metrics.deviation_inches.toFixed(4)}"`;

        // Clear layout map visuals
        const manifestUIs = {
            FWD_CABIN: document.getElementById('manifestFwdCabin'),
            AFT_CABIN: document.getElementById('manifestAftCabin'),
            FWD_HOLD: document.getElementById('manifestFwdHold'),
            AFT_HOLD: document.getElementById('manifestAftHold')
        };

        Object.values(manifestUIs).forEach(ui => ui.innerHTML = '');
        const unassignedContainer = document.getElementById('unassignedContainer');
        unassignedContainer.innerHTML = '';

        // UI toggles & payload population loop
        const visualBoxes = {
            FWD_CABIN: document.getElementById('visualFwdCabin'),
            AFT_CABIN: document.getElementById('visualAftCabin'),
            FWD_HOLD: document.getElementById('visualFwdHold'),
            AFT_HOLD: document.getElementById('visualAftHold')
        };

        for (const [zoneKey, items] of Object.entries(plan.assignments)) {
            // Apply Active Load UI styling
            if (plan.zone_totals[zoneKey].weight > 0) {
                visualBoxes[zoneKey].classList.add('active-load');
            } else {
                visualBoxes[zoneKey].classList.remove('active-load');
            }

            // Populate inner items
            items.forEach(item => {
                const el = document.createElement('div'); 
                el.className = 'bay-tag';
                const subtext = item.type === 'passenger' ? `${item.count} Pax` : 'Cargo';
                el.innerHTML = `<span>${item.id} <small style="opacity: 0.6;">(${subtext})</small></span><strong>${item.weight} lb</strong>`;
                manifestUIs[zoneKey].appendChild(el);
            });
        }

        // Left Behind Array Parsing
        if (plan.unassigned.length === 0) {
            unassignedContainer.innerHTML = '<p class="placeholder-text" style="color:var(--success); font-style:normal; font-weight:600;">✓ All payload items successfully manifested.</p>';
        } else {
            plan.unassigned.forEach(item => {
                const el = document.createElement('div'); el.className = 'unassigned-item';
                el.innerText = `${item.id}: ${item.weight} lbs`;
                unassignedContainer.appendChild(el);
            });
        }

        // Status Readings 
        document.getElementById('statsFwdCabin').innerText = `${plan.zone_totals.FWD_CABIN.items} Seats | ${plan.zone_totals.FWD_CABIN.weight.toLocaleString()} / ${aircraft_params.zones.FWD_CABIN.max_weight.toLocaleString()} lbs`;
        document.getElementById('statsAftCabin').innerText = `${plan.zone_totals.AFT_CABIN.items} Seats | ${plan.zone_totals.AFT_CABIN.weight.toLocaleString()} / ${aircraft_params.zones.AFT_CABIN.max_weight.toLocaleString()} lbs`;
        document.getElementById('statsFwdHold').innerText = `${plan.zone_totals.FWD_HOLD.weight.toLocaleString()} / ${aircraft_params.zones.FWD_HOLD.max_weight.toLocaleString()} lbs`;
        document.getElementById('statsAftHold').innerText = `${plan.zone_totals.AFT_HOLD.weight.toLocaleString()} / ${aircraft_params.zones.AFT_HOLD.max_weight.toLocaleString()} lbs`;

        // Render graphical physical CG vector crosshair placement 
        const cgMarker = document.getElementById('cgMarkerVisual');
        cgMarker.style.display = 'block';
        
        const minArm = aircraft_params.zones.FWD_HOLD.arm - 50; 
        const maxArm = aircraft_params.zones.AFT_HOLD.arm + 50;
        const scalePct = ((plan.metrics.final_cg - minArm) / (maxArm - minArm)) * 100;
        cgMarker.style.left = `${Math.min(Math.max(scalePct, 5), 95)}%`;

    } catch (err) {
        console.error(err);
        statusVal.innerText = "Error";
        statusBox.className = "metric-box status-infeasible";
    }
}

// Global initialization window hook
window.onload = () => {
    renderManifestTable();
    runBackendOptimization();
};