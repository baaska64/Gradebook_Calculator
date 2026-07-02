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
        // Always try to load local first for instant offline startup
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
                    localStorage.setItem(Storage.KEY, JSON.stringify(dataToReturn)); // Cache it
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
        // 1. ALWAYS save locally immediately
        localStorage.setItem(Storage.KEY, JSON.stringify(data));
        showAutosave();

        // 2. Attempt cloud sync
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
            updateSyncUI('offline'); // Revert to offline state if sync fails
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

// --- NEW: Custom Confirm Modal Promise ---
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

        const onOk = () => {
            cleanup();
            resolve(true);
        };

        const onCancel = () => {
            cleanup();
            resolve(false);
        };

        btnOk.addEventListener('click', onOk);
        btnCancel.addEventListener('click', onCancel);
    });
}
// -----------------------------------------

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
        // Replaced native confirm with customConfirm
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
                    bestIs1: true,
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
    interpolateGrade: (percentage, passingPercent, bestIs1) => {
        if (percentage < passingPercent) return bestIs1 ? 5.0 : 1.0;
        if (percentage >= 100) return bestIs1 ? 1.0 : 5.0;

        const ratio = (percentage - passingPercent) / (100 - passingPercent);
        if (bestIs1) {
            return 3.0 - (ratio * (3.0 - 1.0));
        } else {
            return 3.0 + (ratio * (5.0 - 3.0));
        }
    },

    calculateSubject: (subject) => {
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
        const gradeEq = Calculator.interpolateGrade(subjectPercent, Number(subject.passingPercent) || 60, subject.bestIs1);

        return { percent: subjectPercent, equivalent: gradeEq, hasData: totalPeriodWeight > 0 };
    }
};

function showAutosave() {
    const el = document.getElementById('autosave-status');
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 2000);
}

function renderDashboard() {
    let cumulativeUnits = 0;
    let cumulativeGrades = 0;
    let yearGwa = 0, semGwa = 0;

    appData.years.forEach(year => {
        let yearUnits = 0, yearGrades = 0;
        year.semesters.forEach(sem => {
            let semUnits = 0, semGrades = 0;
            sem.subjects.forEach(sub => {
                const res = Calculator.calculateSubject(sub);
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
    const dash = '—.———';

    document.getElementById('gwa-summary').innerHTML = `
        <div class="gwa-card">
            <h3>Semester</h3>
            <span class="stamp stamp--formal">${semGwa > 0 ? semGwa.toFixed(3) : dash}</span>
        </div>
        <div class="gwa-card">
            <h3>Year</h3>
            <span class="stamp stamp--formal stamp--blue">${yearGwa > 0 ? yearGwa.toFixed(3) : dash}</span>
        </div>
        <div class="gwa-card">
            <h3>Cumulative</h3>
            <span class="stamp stamp--formal stamp--green">${cumGwa > 0 ? cumGwa.toFixed(3) : dash}</span>
        </div>
    `;
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

    if (!sem) {
        container.innerHTML = '<p>No data selected. Create a year/semester to begin.</p>';
        return;
    }

    let html = '';
    sem.subjects.forEach(sub => {
        const res = Calculator.calculateSubject(sub);

        html += `
        <div class="subject-block">
            <div class="header-row">
                <h2><input type="text" class="field field--subject" data-path="subName:${year.id}:${sem.id}:${sub.id}" value="${sub.name}" placeholder="Subject Name"></h2>
                <button class="btn-delete" data-action="delete-sub" data-path="${year.id}:${sem.id}:${sub.id}" aria-label="Delete subject" title="Delete subject">&times;</button>
                ${res.hasData ? `<div class="stamp">${res.percent.toFixed(1)}% &rarr; ${res.equivalent.toFixed(2)}</div>` : ''}
            </div>

            <div class="subject-meta">
                <span>Units <input type="number" class="field w-xs" data-path="subUnits:${year.id}:${sem.id}:${sub.id}" value="${sub.units}"></span>
                <span class="divider">&middot;</span>
                <span>Pass % <input type="number" class="field w-xs" data-path="subPass:${year.id}:${sem.id}:${sub.id}" value="${sub.passingPercent}"></span>
                <span class="divider">&middot;</span>
                <select class="field field--select" data-path="subScale:${year.id}:${sem.id}:${sub.id}">
                    <option value="true" ${sub.bestIs1 ? 'selected' : ''}>1.0 is Best</option>
                    <option value="false" ${!sub.bestIs1 ? 'selected' : ''}>5.0 is Best</option>
                </select>
            </div>

            ${sub.periods.map(per => `
                <div class="period-block">
                    <div class="header-row">
                        <h3><input type="text" class="field field--period" data-path="perName:${year.id}:${sem.id}:${sub.id}:${per.id}" value="${per.name}"></h3>
                        <button class="btn-delete btn-delete--tiny" data-action="delete-period" data-path="${year.id}:${sem.id}:${sub.id}:${per.id}" aria-label="Delete period">&times;</button>
                        <span class="inline-setting">Weight <input type="number" class="field field--weight w-xs" data-path="perWeight:${year.id}:${sem.id}:${sub.id}:${per.id}" value="${per.weight}">%</span>
                    </div>

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
                    <button class="btn-add" style="margin-left:2rem;" data-action="add-comp" data-path="${year.id}:${sem.id}:${sub.id}:${per.id}">+ Component</button>
                </div>
            `).join('')}
            <button class="btn-add" data-action="add-period" data-path="${year.id}:${sem.id}:${sub.id}">+ Period</button>
        </div>`;
    });

    html += `<button class="btn-add" data-action="add-sub" data-path="${year.id}:${sem.id}">+ Add New Subject</button>`;
    container.innerHTML = html;
}

function updateUI() {
    renderTabs();
    renderLedger();
    renderDashboard();
    Storage.setRecord(appData);
}

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

// Changed to async to support the await customConfirm pattern
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
            s.subjects.push({ id: generateId(), name: 'New Subject', units: 3, bestIs1: true, passingPercent: 60, periods: [] });
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
        // Replaced native confirm with customConfirm
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
    if (field === 'subScale') sub.bestIs1 = (val === 'true');
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
    // Replaced native confirm with customConfirm
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

    state.currentYearId = appData.years[0]?.id || null;

    const currentYear = appData.years.find(y => y.id === state.currentYearId);
    state.currentSemId = currentYear?.semesters[0]?.id || null;

    updateUI();
}

initApp();