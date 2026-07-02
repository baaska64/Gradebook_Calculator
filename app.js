const SUPABASE_URL = window.ENV_SUPABASE_URL || 'https://rkoeciiwqolgcjduhdqz.supabase.co';
const SUPABASE_ANON_KEY = window.ENV_SUPABASE_KEY || 'sb_publishable_mB9EQATPU3C641O0_XbC2w_oWzrn8Pb';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let isOnline = navigator.onLine;
let hasPendingSync = false;

function updateSyncUI(state) {
    const el = document.getElementById('sync-status');
    el.className = 'sync-status ' + state;
    if (state === 'synced') el.textContent = 'Cloud Synced';
    if (state === 'offline') el.textContent = 'Offline (Saved Locally)';
    if (state === 'pending') el.textContent = 'Syncing...';
}

window.addEventListener('online', () => {
    isOnline = true;
    if (hasPendingSync) Storage.syncToCloud();
    else updateSyncUI('synced');
});

window.addEventListener('offline', () => {
    isOnline = false;
    updateSyncUI('offline');
});

const Storage = {
    KEY: 'grade_ledger_v2_data',
    getRecord: async () => {
        const localData = localStorage.getItem(Storage.KEY);
        let dataToReturn = localData ? JSON.parse(localData) : null;

        if (currentUser && isOnline) {
            try {
                const { data, error } = await supabaseClient
                    .from('user_ledgers')
                    .select('ledger_data')
                    .eq('id', currentUser.id)
                    .single();
                
                if (data?.ledger_data) {
                    dataToReturn = data.ledger_data;
                    localStorage.setItem(Storage.KEY, JSON.stringify(dataToReturn));
                }
                updateSyncUI('synced');
            } catch (err) {
                console.error("Cloud fetch failed, using local.");
            }
        } else if (!isOnline) {
            updateSyncUI('offline');
        }
        return dataToReturn;
    },
    setRecord: async (data) => {
        localStorage.setItem(Storage.KEY, JSON.stringify(data));
        showAutosave();
        if (currentUser) {
            if (isOnline) {
                updateSyncUI('pending');
                await Storage.syncToCloud(data);
            } else {
                hasPendingSync = true;
                updateSyncUI('offline');
            }
        }
    },
    syncToCloud: async (data = null) => {
        if (!currentUser) return;
        const dataToSync = data || JSON.parse(localStorage.getItem(Storage.KEY));
        try {
            const { error } = await supabaseClient
                .from('user_ledgers')
                .upsert({ id: currentUser.id, ledger_data: dataToSync });
            if (error) throw error;
            hasPendingSync = false;
            updateSyncUI('synced');
        } catch (err) {
            hasPendingSync = true;
            updateSyncUI('offline');
        }
    },
    clearRecords: async () => {
        localStorage.removeItem(Storage.KEY);
        if (currentUser && isOnline) {
            await supabaseClient.from('user_ledgers').delete().eq('id', currentUser.id);
        }
    }
};

function toggleModal(show) {
    document.getElementById('auth-modal').style.display = show ? 'flex' : 'none';
    document.getElementById('auth-message').textContent = '';
}

function customConfirm(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const messageEl = document.getElementById('confirm-message');
        const btnOk = document.getElementById('btn-confirm-ok');
        const btnCancel = document.getElementById('btn-confirm-cancel');

        messageEl.textContent = message;
        modal.style.display = 'flex';

        const cleanup = () => {
            modal.style.display = 'none';
            btnOk.removeEventListener('click', onOk);
            btnCancel.removeEventListener('click', onCancel);
        };
        const onOk = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };

        btnOk.addEventListener('click', onOk);
        btnCancel.addEventListener('click', onCancel);
    });
}

async function handleAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentUser = session?.user || null;
    updateAuthUI();

    document.getElementById('btn-login').onclick = () => toggleModal(true);
    document.getElementById('btn-submit-login').onclick = async () => {
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) document.getElementById('auth-message').textContent = error.message;
        else window.location.reload();
    };
    document.getElementById('btn-submit-signup').onclick = async () => {
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const { error } = await supabaseClient.auth.signUp({ email, password });
        if (error) document.getElementById('auth-message').textContent = error.message;
        else alert('Signup successful! Please check your email to verify your account.');
    };
    document.getElementById('btn-delete-account').onclick = async () => {
        const proceed = await customConfirm('PERMANENT ACTION: This will delete your account and all stored grades. Proceed?');
        if (!proceed) return;
        await supabaseClient.from('user_ledgers').delete().eq('id', currentUser.id);
        await supabaseClient.auth.signOut();
        alert('Account deleted. Your local data remains; you may clear it using the Reset button.');
        window.location.reload();
    };
    document.getElementById('btn-logout').onclick = async () => {
        await supabaseClient.auth.signOut();
        window.location.reload();
    };
}

function updateAuthUI() {
    const loginBtn = document.getElementById('btn-login');
    const logoutBtn = document.getElementById('btn-logout');
    const deleteBtn = document.getElementById('btn-delete-account');
    const userEmail = document.getElementById('user-email');

    if (currentUser) {
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-block';
        deleteBtn.style.display = 'inline-block';
        userEmail.textContent = currentUser.email;
    } else {
        loginBtn.style.display = 'inline-block';
        logoutBtn.style.display = 'none';
        deleteBtn.style.display = 'none';
        userEmail.textContent = 'Guest (Local Only)';
    }
}

function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

function getInitialData() {
    return {
        settings: { gradingSystem: '1_IS_BEST' },
        years: [{
            id: generateId(),
            name: '2025-2026',
            semesters: [{
                id: generateId(),
                name: '1st Semester',
                subjects: [{
                    id: generateId(),
                    name: 'Software Engineering',
                    units: 3,
                    passingPercent: 60,
                    periods: [{
                        id: generateId(),
                        name: 'Midterms',
                        weight: 50,
                        components: [{
                            id: generateId(),
                            name: 'Exams',
                            weight: 100,
                            items: [{ id: generateId(), score: 85, max: 100 }]
                        }]
                    }]
                }]
            }]
        }]
    };
}

let appData = null;
let state = { currentYearId: null, currentSemId: null };

const Calculator = {
interpolateGrade: (percentage, passingPercent, system) => {
        if (system === 'PERCENT') return percentage;
        
        // --- NEW 4.0 LOGIC ---
        if (system === '4_IS_BEST') {
            if (percentage < passingPercent) return 0.0;
            if (percentage >= 100) return 4.0;
            const ratio = (percentage - passingPercent) / (100 - passingPercent);
            return 1.0 + (ratio * 3.0); // Passing is 1.0, Max is 4.0
        }
        // ---------------------

        if (percentage < passingPercent) return system === '1_IS_BEST' ? 5.0 : 1.0;
        if (percentage >= 100) return system === '1_IS_BEST' ? 1.0 : 5.0;
        
        const ratio = (percentage - passingPercent) / (100 - passingPercent);
        if (system === '1_IS_BEST') {
            return 3.0 - (ratio * 2.0);
        } else {
            return 3.0 + (ratio * 2.0);
        }
    },
    calculateSubject: (subject, system) => {
        let totalPeriodWeight = 0;
        let earnedPeriodPercent = 0;

        subject.periods.forEach(period => {
            let totalCompWeight = 0;
            let earnedCompPercent = 0;
            period.components.forEach(comp => {
                let sumScore = 0, sumMax = 0;
                comp.items.forEach(item => {
                    sumScore += Number(item.score) || 0;
                    sumMax += Number(item.max) || 0;
                });
                const compPercent = sumMax > 0 ? (sumScore / sumMax) * 100 : 0;
                const weight = Number(comp.weight) || 0;
                earnedCompPercent += compPercent * (weight / 100);
                totalCompWeight += weight;
            });
            const periodFinalPercent = totalCompWeight > 0 ? (earnedCompPercent / (totalCompWeight / 100)) : 0;
            const pWeight = Number(period.weight) || 0;
            earnedPeriodPercent += periodFinalPercent * (pWeight / 100);
            totalPeriodWeight += pWeight;
        });

        const subjectPercent = totalPeriodWeight > 0 ? (earnedPeriodPercent / (totalPeriodWeight / 100)) : 0;
        const gradeEq = Calculator.interpolateGrade(subjectPercent, Number(subject.passingPercent) || 60, system);
        return { percent: subjectPercent, equivalent: gradeEq, hasData: totalPeriodWeight > 0 };
    },
    calculatePeriod: (period, passingPercent) => {
        let totalCompWeight = 0;
        let earnedCompPercent = 0;

        const comps = period.components.map(comp => {
            let sumScore = 0, sumMax = 0;
            comp.items.forEach(it => { sumScore += Number(it.score) || 0; sumMax += Number(it.max) || 0; });
            const pct = sumMax > 0 ? (sumScore / sumMax) * 100 : 0;
            const w = Number(comp.weight) || 0;
            const contrib = pct * (w / 100); 
            const hasData = sumMax > 0;
            earnedCompPercent += contrib;
            totalCompWeight += w;
            return { id: comp.id, name: comp.name, weight: w, percent: pct, contrib, hasData };
        });

        const periodPercent = totalCompWeight > 0 ? (earnedCompPercent / (totalCompWeight / 100)) : 0;
        const passing = Number(passingPercent) || 60;
        const gap = passing - periodPercent;

        return {
            comps, percent: periodPercent, totalWeight: totalCompWeight, hasData: comps.some(c => c.hasData), passing, gap
        };
    }
};

function showAutosave() {
    const el = document.getElementById('autosave-status');
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 2000);
}

function gwaRatio(gwa, system) {
    if (!gwa || gwa <= 0) return 0;
    if (system === 'PERCENT') return Math.max(0, Math.min(100, gwa)) / 100;
    
    // --- NEW 4.0 LOGIC ---
    if (system === '4_IS_BEST') {
        const clamped = Math.max(0, Math.min(4, gwa));
        return clamped / 4; // 4.0 fills the ring completely
    }
    // ---------------------

    const clamped = Math.max(1, Math.min(5, gwa));
    if (system === '1_IS_BEST') return (5 - clamped) / 4; 
    return (clamped - 1) / 4; 
}

function pctTier(pct) {
    if (pct >= 90) return 'excellent';
    if (pct >= 75) return 'good';
    if (pct >= 60) return 'ok';
    return 'warn';
}

function gwaTier(gwa, system) {
    if (!gwa) return 'muted';

    if (system === 'PERCENT') {
        if (gwa >= 90) return 'excellent';
        if (gwa >= 75) return 'good';
        if (gwa >= 60) return 'ok';
        return 'warn';
    }

    // Thresholds proportionately mapped to 90%, 75%, and 60% underlying scores
    if (system === '4_IS_BEST') {
        if (gwa >= 3.25) return 'excellent'; // equates to 90%
        if (gwa >= 2.125) return 'good';     // equates to 75% ("On Track")
        if (gwa >= 1.0) return 'ok';         // equates to 60% ("Passing")
        return 'warn';
    }

    if (system === '1_IS_BEST') {
        if (gwa <= 1.5) return 'excellent';  // equates to 90%
        if (gwa <= 2.25) return 'good';      // equates to 75%
        if (gwa <= 3.0) return 'ok';         // equates to 60%
        return 'warn';
    } else { // 5.0 IS BEST
        if (gwa >= 4.5) return 'excellent';  // equates to 90%
        if (gwa >= 3.75) return 'good';      // equates to 75%
        if (gwa >= 3.0) return 'ok';         // equates to 60%
        return 'warn';
    }
}

function tierLabel(tier) {
    return { excellent: 'Excellent', good: 'On Track', ok: 'Passing', warn: 'At Risk', muted: 'No Data' }[tier];
}

function donutCard(label, val, system) {
    const dash = '-';
    const tier = gwaTier(val, system);
    const ratio = gwaRatio(val, system);
    const R = 45, C = 2 * Math.PI * R;
    const offset = C * (1 - ratio);

    let displayVal = dash;
    if (val > 0) {
        displayVal = system === 'PERCENT' ? val.toFixed(1) + '%' : val.toFixed(3);
    }

    return `
        <div class="gwa-card">
            <h3>${label}</h3>
            <div class="gwa-donut tier-${tier}" role="img" aria-label="${label} GWA ${displayVal}">
                <svg viewBox="0 0 100 100">
                    <circle class="track" cx="50" cy="50" r="${R}"></circle>
                    <circle class="arc" cx="50" cy="50" r="${R}"
                        style="stroke-dasharray:${C.toFixed(1)}; stroke-dashoffset:${offset.toFixed(1)};"></circle>
                </svg>
                <div class="center">
                    <div class="value">${displayVal}</div>
                    <div class="label">${system === 'PERCENT' ? 'AVE' : 'GWA'}</div>
                </div>
            </div>
            <span class="gwa-tier tier-${tier}"><span class="dot"></span>${tierLabel(tier)}</span>
        </div>`;
}

function renderDashboard() {
    const system = appData.settings?.gradingSystem || '1_IS_BEST';
    let cumulativeUnits = 0;
    let cumulativeGrades = 0;
    let yearGwa = 0, semGwa = 0;

    appData.years.forEach(year => {
        let yearUnits = 0, yearGrades = 0;
        year.semesters.forEach(sem => {
            let semUnits = 0, semGrades = 0;
            sem.subjects.forEach(sub => {
                const res = Calculator.calculateSubject(sub, system);
                if (res.hasData) {
                    const u = Number(sub.units) || 1;
                    semUnits += u;
                    semGrades += res.equivalent * u;
                }
            });
            if (sem.id === state.currentSemId && semUnits > 0) semGwa = semGrades / semUnits;
            yearUnits += semUnits;
            yearGrades += semGrades;
        });
        if (year.id === state.currentYearId && yearUnits > 0) yearGwa = yearGrades / yearUnits;
        cumulativeUnits += yearUnits;
        cumulativeGrades += yearGrades;
    });

    const cumGwa = cumulativeUnits > 0 ? (cumulativeGrades / cumulativeUnits) : 0;
    document.getElementById('gwa-summary').innerHTML =
        donutCard('Semester', semGwa, system) +
        donutCard('Year', yearGwa, system) +
        donutCard('Cumulative', cumGwa, system);
}

function renderTabs() {
    const yTabs = document.getElementById('year-tabs');
    const sTabs = document.getElementById('sem-tabs');

    yTabs.innerHTML = appData.years.map(y =>
        `<div class="tab ${y.id === state.currentYearId ? 'active' : ''}" data-type="year" data-id="${y.id}">
            <input type="text" class="field field--tabname" data-path="year:${y.id}" value="${y.name}" size="${y.name.length || 4}">
            <button class="btn-delete" data-action="delete-year" data-path="${y.id}" aria-label="Delete year" title="Delete year">&times;</button>
        </div>`
    ).join('') + `<button class="tab btn-add" data-action="add-year" aria-label="Add year">+</button>`;

    const currentYear = appData.years.find(y => y.id === state.currentYearId);
    if (currentYear) {
        sTabs.innerHTML = currentYear.semesters.map(s =>
            `<div class="tab ${s.id === state.currentSemId ? 'active' : ''}" data-type="sem" data-id="${s.id}">
                <input type="text" class="field field--tabname" data-path="sem:${currentYear.id}:${s.id}" value="${s.name}" size="${s.name.length || 4}">
                <button class="btn-delete" data-action="delete-sem" data-path="${currentYear.id}:${s.id}" aria-label="Delete semester" title="Delete semester">&times;</button>
            </div>`
        ).join('') + `<button class="tab btn-add" data-action="add-sem" aria-label="Add semester">+</button>`;
    } else {
        sTabs.innerHTML = '';
    }
}

function renderLedger() {
    const container = document.getElementById('ledger-content');
    const year = appData.years.find(y => y.id === state.currentYearId);
    const sem = year?.semesters.find(s => s.id === state.currentSemId);
    const system = appData.settings?.gradingSystem || '1_IS_BEST';

    if (!sem) {
        container.innerHTML = '<p>No data selected. Create a year/semester to begin.</p>';
        return;
    }

    const chartRows = sem.subjects.map(sub => {
        const r = Calculator.calculateSubject(sub, system);
        return { name: sub.name || 'Untitled', res: r };
    });

    const hasAny = chartRows.some(r => r.res.hasData);
    let html = `
        <div class="sem-chart">
            <h3>Subject Performance &mdash; ${sem.name}</h3>
            ${hasAny ? chartRows.map(r => {
                if (!r.res.hasData) {
                    return `<div class="row"><div class="name">${r.name}</div><div class="bar"></div><div class="val">-</div></div>`;
                }
                const tier = pctTier(r.res.percent);
                const w = Math.max(2, Math.min(100, r.res.percent));
                return `<div class="row">
                    <div class="name">${r.name}</div>
                    <div class="bar"><div class="fill tier-${tier}" style="width:${w.toFixed(1)}%"></div></div>
                    <div class="val">${r.res.percent.toFixed(1)}%</div>
                </div>`;
            }).join('') : `<div class="empty">Add scores to see comparisons.</div>`}
        </div>`;

    sem.subjects.forEach(sub => {
        const res = Calculator.calculateSubject(sub, system);
        const tier = res.hasData ? pctTier(res.percent) : 'muted';
        const passPct = Number(sub.passingPercent) || 60;
        const barW = res.hasData ? Math.max(0, Math.min(100, res.percent)) : 0;
        
        const eqText = system === 'PERCENT' 
            ? (res.hasData ? res.equivalent.toFixed(1) + '%' : 'no data') 
            : (res.hasData ? 'GE ' + res.equivalent.toFixed(2) : 'no data');
            
        const stampText = system === 'PERCENT' 
            ? `${res.percent.toFixed(1)}%`
            : `${res.percent.toFixed(1)}% &rarr; ${res.equivalent.toFixed(2)}`;

        html += `
        <div class="subject-block">
            <div class="header-row">
                <h2><input type="text" class="field field--subject" data-path="subName:${year.id}:${sem.id}:${sub.id}" value="${sub.name}" placeholder="Subject Name"></h2>
                <button class="btn-delete" data-action="delete-sub" data-path="${year.id}:${sem.id}:${sub.id}" aria-label="Delete subject" title="Delete subject">&times;</button>
                ${res.hasData ? `<div class="stamp">${stampText}</div>` : ''}
            </div>
            <div class="subject-progress">
                <div class="bar">
                    <div class="fill tier-${tier}" style="width:${barW.toFixed(1)}%"></div>
                    <div class="pass-marker" style="left:${passPct}%" data-label="pass ${passPct}%"></div>
                </div>
                <div class="pct">${res.hasData ? res.percent.toFixed(1) + '%' : '-'}</div>
                <div class="eq">${eqText}</div>
            </div>
            <div class="subject-meta">
                <span>Units <input type="number" class="field w-xs" data-path="subUnits:${year.id}:${sem.id}:${sub.id}" value="${sub.units}"></span>
                <span class="divider">&middot;</span>
                <span>Pass % <input type="number" class="field w-xs" data-path="subPass:${year.id}:${sem.id}:${sub.id}" value="${sub.passingPercent}"></span>
            </div>
${sub.periods.map(per => {
                const pd = Calculator.calculatePeriod(per, sub.passingPercent);
                const perTier = pd.hasData ? pctTier(pd.percent) : 'muted';
                const gradeChip = pd.hasData ? `<span class="period-chip tier-${perTier}">${pd.percent.toFixed(2)}</span>` : '';

                // 1. Separate the breakdown list...
                const breakdownList = pd.hasData ? `
                    <div class="breakdown-list">
                        ${pd.comps.map(c => {
                            const cTier = c.hasData ? pctTier(c.percent) : 'muted';
                            return `
                            <div class="bd-row">
                                <div class="bd-main">
                                    <div class="bd-name">${c.name || 'Untitled'}</div>
                                    <div class="bd-meta">${c.weight}% weight &mdash; contributes ${c.contrib.toFixed(1)} pts</div>
                                    <div class="bd-track"><div class="bd-fill tier-${cTier}" style="width:${Math.max(0,Math.min(100,c.percent)).toFixed(1)}%"></div></div>
                                </div>
                                <div class="bd-val tier-${cTier}">${c.hasData ? c.percent.toFixed(1) : '-'}</div>
                            </div>`;
                        }).join('')}
                    </div>` : `<div class="breakdown-empty">Add scores to see the period breakdown.</div>`;

                // 2. ...from the Period Grade Card
                const periodGradeCard = pd.hasData ? `
                    <div class="period-grade tier-${perTier}" style="margin-top: 24px;">
                        <div class="pg-label">Period Grade${per.weight ? ` (${per.weight}% of subject)` : ''}</div>
                        <div class="pg-value">${pd.percent.toFixed(2)}</div>
                        <div class="pg-rule"></div>
                        <div class="pg-note">
                            ${pd.gap > 0
                                ? `<span class="warn-ico">⚠</span> Need ${pd.gap.toFixed(1)} more points to pass`
                                : `<span class="ok-ico">✓</span> Passing by ${(-pd.gap).toFixed(1)} points`}
                        </div>
                    </div>` : '';

                return `
                <div class="period-block">
                    <div class="header-row period-header">
                        <span class="period-tag">${(per.name || 'Period').toUpperCase()}</span>
                        <h3><input type="text" class="field field--period" data-path="perName:${year.id}:${sem.id}:${sub.id}:${per.id}" value="${per.name}"></h3>
                        <button class="btn-delete btn-delete--tiny" data-action="delete-period" data-path="${year.id}:${sem.id}:${sub.id}:${per.id}" aria-label="Delete period">&times;</button>
                        <span class="inline-setting">Weight <input type="number" class="field field--weight w-xs" data-path="perWeight:${year.id}:${sem.id}:${sub.id}:${per.id}" value="${per.weight}">%</span>
                        <div class="period-grade-inline">
                            <span class="pgi-label">Period Grade</span>
                            ${gradeChip || '<span class="period-chip tier-muted">-</span>'}
                        </div>
                    </div>
                    <div class="period-grid">
                        <div class="period-inputs">
                            ${per.components.map(comp => `
                                <div class="component-block">
                                    <div class="header-row">
                                        <h4><input type="text" class="field field--component" data-path="compName:${year.id}:${sem.id}:${sub.id}:${per.id}:${comp.id}" value="${comp.name}"></h4>
                                        <button class="btn-delete btn-delete--tiny" data-action="delete-comp" data-path="${year.id}:${sem.id}:${sub.id}:${per.id}:${comp.id}" aria-label="Delete component">&times;</button>
                                        <span class="inline-setting">Weight <input type="number" class="field field--weight w-xs" data-path="compWeight:${year.id}:${sem.id}:${sub.id}:${per.id}:${comp.id}" value="${comp.weight}">%</span>
                                    </div>
                                    ${comp.items.map((item) => `
                                        <div class="item-row">
                                            <input type="number" class="field w-sm" data-path="score:${year.id}:${sem.id}:${sub.id}:${per.id}:${comp.id}:${item.id}" value="${item.score}">
                                            <span class="slash">/</span>
                                            <input type="number" class="field w-sm" data-path="max:${year.id}:${sem.id}:${sub.id}:${per.id}:${comp.id}:${item.id}" value="${item.max}">
                                            <button class="btn-delete btn-delete--tiny" data-action="delete-item" data-path="${year.id}:${sem.id}:${sub.id}:${per.id}:${comp.id}:${item.id}" aria-label="Delete item">&times;</button>
                                        </div>
                                    `).join('')}
                                    <button class="btn-add" data-action="add-item" data-path="${year.id}:${sem.id}:${sub.id}:${per.id}:${comp.id}">+ Item</button>
                                </div>
                            `).join('')}
                            <button class="btn-add" data-action="add-comp" data-path="${year.id}:${sem.id}:${sub.id}:${per.id}">+ Component</button>
                            
                            <!-- 3. Inject the Period Grade Card here to fill the left gap -->
                            ${periodGradeCard} 
                            
                        </div>
                        <aside class="period-summary">
                            <div class="breakdown-title">Period Breakdown</div>
                            
                            <!-- 4. Only render the list on the right -->
                            ${breakdownList}
                            
                        </aside>
                    </div>
                </div>`;
            }).join('')}
            <button class="btn-add" data-action="add-period" data-path="${year.id}:${sem.id}:${sub.id}">+ Period</button>
        </div>`;
    });

    html += `<button class="btn-add" data-action="add-sub" data-path="${year.id}:${sem.id}">+ Add New Subject</button>`;
    container.innerHTML = html;
}

function updateUI() {
    document.getElementById('global-grade-system').value = appData.settings?.gradingSystem || '1_IS_BEST';
    renderTabs();
    renderLedger();
    renderDashboard();
    Storage.setRecord(appData);
}

// Global Grade System Listener
document.getElementById('global-grade-system').addEventListener('change', (e) => {
    if (!appData.settings) appData.settings = {};
    appData.settings.gradingSystem = e.target.value;
    updateUI();
});

document.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (tab && tab.dataset.type && !e.target.classList.contains('field--tabname') && !e.target.classList.contains('btn-delete')) {
        if (tab.dataset.type === 'year') {
            state.currentYearId = tab.dataset.id;
            const currentYear = appData.years.find(y => y.id === state.currentYearId);
            state.currentSemId = currentYear?.semesters[0]?.id || null;
        } else if (tab.dataset.type === 'sem') {
            state.currentSemId = tab.dataset.id;
        }
        updateUI();
    }
});

document.addEventListener('click', async (e) => {
    const action = e.target.dataset.action;
    if (!action) return;

    const path = e.target.dataset.path?.split(':');
    if (action.startsWith('add-')) {
        const y = path ? appData.years.find(y => y.id === path[0]) : null;
        const s = y ? y.semesters.find(s => s.id === path[1]) : null;
        const sub = s ? s.subjects.find(sub => sub.id === path[2]) : null;
        const p = sub ? sub.periods.find(p => p.id === path[3]) : null;
        const c = p ? p.components.find(c => c.id === path[4]) : null;

        if (action === 'add-year') {
            const newYear = { id: generateId(), name: 'New Year', semesters: [] };
            appData.years.push(newYear);
            state.currentYearId = newYear.id;
            state.currentSemId = null;
        } else if (action === 'add-sem') {
            const currentYear = appData.years.find(y => y.id === state.currentYearId);
            const newSem = { id: generateId(), name: 'New Sem', subjects: [] };
            currentYear.semesters.push(newSem);
            state.currentSemId = newSem.id;
        } else if (action === 'add-sub') {
            s.subjects.push({ id: generateId(), name: 'New Subject', units: 3, passingPercent: 60, periods: [] });
        } else if (action === 'add-period') {
            sub.periods.push({ id: generateId(), name: 'New Period', weight: 0, components: [] });
        } else if (action === 'add-comp') {
            p.components.push({ id: generateId(), name: 'New Comp', weight: 0, items: [] });
        } else if (action === 'add-item') {
            c.items.push({ id: generateId(), score: 0, max: 100 });
        }
        updateUI();
    }

    if (action.startsWith('delete-')) {
        const proceed = await customConfirm('Delete this record? This cannot be undone.');
        if (!proceed) return;

        if (action === 'delete-year') {
            appData.years = appData.years.filter(y => y.id !== path[0]);
            if (appData.years.length === 0) appData.years.push({ id: generateId(), name: 'New Year', semesters: [] });
            if (state.currentYearId === path[0]) {
                state.currentYearId = appData.years[0].id;
                state.currentSemId = appData.years[0].semesters[0]?.id || null;
            }
        } else if (action === 'delete-sem') {
            const y = appData.years.find(y => y.id === path[0]);
            y.semesters = y.semesters.filter(s => s.id !== path[1]);
            if (state.currentSemId === path[1]) state.currentSemId = y.semesters[0]?.id || null;
        } else if (action === 'delete-sub') {
            const s = appData.years.find(y => y.id === path[0]).semesters.find(s => s.id === path[1]);
            s.subjects = s.subjects.filter(sub => sub.id !== path[2]);
        } else if (action === 'delete-period') {
            const sub = appData.years.find(y => y.id === path[0]).semesters.find(s => s.id === path[1]).subjects.find(sub => sub.id === path[2]);
            sub.periods = sub.periods.filter(p => p.id !== path[3]);
        } else if (action === 'delete-comp') {
            const p = appData.years.find(y => y.id === path[0]).semesters.find(s => s.id === path[1]).subjects.find(sub => sub.id === path[2]).periods.find(p => p.id === path[3]);
            p.components = p.components.filter(c => c.id !== path[4]);
        } else if (action === 'delete-item') {
            const c = appData.years.find(y => y.id === path[0]).semesters.find(s => s.id === path[1]).subjects.find(sub => sub.id === path[2]).periods.find(p => p.id === path[3]).components.find(c => c.id === path[4]);
            c.items = c.items.filter(i => i.id !== path[5]);
        }
        updateUI();
    }
});

document.addEventListener('change', (e) => {
    const pathStr = e.target.dataset.path;
    if (!pathStr) return;

    const parts = pathStr.split(':');
    const field = parts[0];
    const val = e.target.value;

    const y = appData.years.find(y => y.id === parts[1]);
    const s = y?.semesters.find(s => s.id === parts[2]);
    const sub = s?.subjects.find(sub => sub.id === parts[3]);
    const p = sub?.periods.find(p => p.id === parts[4]);
    const c = p?.components.find(c => c.id === parts[5]);
    const item = c?.items.find(i => i.id === parts[6]);

    if (field === 'year') y.name = val;
    if (field === 'sem') s.name = val;
    if (field === 'subName') sub.name = val;
    if (field === 'subUnits') sub.units = val;
    if (field === 'subPass') sub.passingPercent = val;
    if (field === 'perName') p.name = val;
    if (field === 'perWeight') p.weight = val;
    if (field === 'compName') c.name = val;
    if (field === 'compWeight') c.weight = val;
    if (field === 'score') item.score = val;
    if (field === 'max') item.max = val;

    updateUI();
});

document.addEventListener('input', (e) => {
    if (e.target.type === 'text') {
        e.target.size = Math.max(e.target.value.length, 4);
    }
});

document.getElementById('btn-reset').addEventListener('click', async () => {
    const proceed = await customConfirm('Are you sure you want to clear all ledger data? This cannot be undone.');
    if (proceed) {
        await Storage.clearRecords();
        appData = getInitialData();
        state.currentYearId = appData.years[0].id;
        state.currentSemId = appData.years[0].semesters[0].id;
        updateUI();
    }
});

async function initApp() {
    await handleAuth();
    const savedData = await Storage.getRecord();
    appData = savedData || getInitialData();
    
    if (!appData.settings) {
        appData.settings = { gradingSystem: '1_IS_BEST' };
    }

    state.currentYearId = appData.years[0]?.id || null;
    const currentYear = appData.years.find(y => y.id === state.currentYearId);
    state.currentSemId = currentYear?.semesters[0]?.id || null;

    updateUI();
}

initApp();