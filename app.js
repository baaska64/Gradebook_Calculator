const SUPABASE_URL = window.ENV_SUPABASE_URL || 'https://rkoeciiwqolgcjduhdqz.supabase.co';
const SUPABASE_ANON_KEY = window.ENV_SUPABASE_KEY || 'sb_publishable_mB9EQATPU3C641O0_XbC2w_oWzrn8Pb';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let isOnline = navigator.onLine;
let hasPendingSync = false;

// --- Theme Management ---
const themeBtn = document.getElementById('btn-theme');
const currentTheme = localStorage.getItem('grade_ledger_theme') || 'light';

if (currentTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    if (themeBtn) themeBtn.textContent = 'Light Mode';
}

if (themeBtn) {
    themeBtn.addEventListener('click', () => {
        let theme = document.documentElement.getAttribute('data-theme');
        if (theme === 'dark') {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('grade_ledger_theme', 'light');
            themeBtn.textContent = 'Dark Mode';
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('grade_ledger_theme', 'dark');
            themeBtn.textContent = 'Light Mode';
        }
    });
}
// ------------------------

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
                        weight: '',
                        isCollapsed: false,
                        components: [{
                            id: generateId(),
                            name: 'Exams',
                            weight: '',
                            isCollapsed: false,
                            items: [{ id: generateId(), name: '', score: '', max: 100, weight: '' }]
                        }]
                    }]
                }]
            }]
        }]
    };
}

let appData = null;
let state = { currentYearId: null, currentSemId: null, currentSubId: null };

// Default string matching lists to automatically wipe when selected
const KNOWN_DEFAULTS = ['New Subject', 'New Period', 'New Comp', '3', '60', '100'];

const Calculator = {
    interpolateGrade: (percentage, passingPercent, system) => {
        if (system === 'PERCENT') return percentage;
        
        if (system === '4_IS_BEST') {
            if (percentage < passingPercent) return 0.0;
            if (percentage >= 100) return 4.0;
            const ratio = (percentage - passingPercent) / (100 - passingPercent);
            return 1.0 + (ratio * 3.0); 
        }

        if (percentage < passingPercent) return system === '1_IS_BEST' ? 5.0 : 1.0;
        if (percentage >= 100) return system === '1_IS_BEST' ? 1.0 : 5.0;
        
        const ratio = (percentage - passingPercent) / (100 - passingPercent);
        if (system === '1_IS_BEST') {
            return 3.0 - (ratio * 2.0);
        } else {
            return 3.0 + (ratio * 2.0);
        }
    },

    percentFromGpa: (gpa, passingPercent, system) => {
        passingPercent = Number(passingPercent) || 60;
        let ratio = 0;
        
        if (system === '4_IS_BEST') {
            ratio = Math.max(0, Math.min(1, (gpa - 1.0) / 3.0));
        } else if (system === '1_IS_BEST') {
            ratio = Math.max(0, Math.min(1, (3.0 - gpa) / 2.0));
        } else if (system === '5_IS_BEST') {
            ratio = Math.max(0, Math.min(1, (gpa - 3.0) / 2.0));
        } else {
            return gpa; 
        }
        return passingPercent + (ratio * (100 - passingPercent));
    },
    
    calculateSubject: (subject, system) => {
        let absoluteEarned = 0;
        let emptyTargets = [];
        let absoluteAvailable = 0;
        let hasAnyInput = false;

        let pExplicitSum = 0, pBlankCount = 0;
        subject.periods.forEach(p => {
            if (p.weight !== '' && p.weight !== null && p.weight !== undefined) pExplicitSum += Number(p.weight) || 0;
            else pBlankCount++;
        });
        let pAutoWeight = pBlankCount > 0 ? Math.max(0, 100 - pExplicitSum) / pBlankCount : 0;
        let totalPeriodWeightSum = pExplicitSum + (pBlankCount * pAutoWeight);

        subject.periods.forEach(period => {
            const pWeight = (period.weight !== '' && period.weight !== null && period.weight !== undefined) ? Number(period.weight) || 0 : pAutoWeight;
            const periodPctOfSubject = totalPeriodWeightSum > 0 ? (pWeight / totalPeriodWeightSum) : 0;
            
            let cExplicitSum = 0, cBlankCount = 0;
            period.components.forEach(c => {
                if (c.weight !== '' && c.weight !== null && c.weight !== undefined) cExplicitSum += Number(c.weight) || 0;
                else cBlankCount++;
            });
            let cAutoWeight = cBlankCount > 0 ? Math.max(0, 100 - cExplicitSum) / cBlankCount : 0;
            let totalCompWeightSum = cExplicitSum + (cBlankCount * cAutoWeight);

            period.components.forEach(comp => {
                const compWeight = (comp.weight !== '' && comp.weight !== null && comp.weight !== undefined) ? Number(comp.weight) || 0 : cAutoWeight;
                const compPctOfPeriod = totalCompWeightSum > 0 ? (compWeight / totalCompWeightSum) : 0;
                
                let iExplicitSum = 0, iBlankCount = 0;
                comp.items.forEach(item => {
                    if (item.weight !== '' && item.weight !== null && item.weight !== undefined) iExplicitSum += Number(item.weight) || 0;
                    else iBlankCount++;
                });

                let iAutoWeight = iBlankCount > 0 ? Math.max(0, 100 - iExplicitSum) / iBlankCount : 0;
                let totalItemWeightSum = iExplicitSum + (iBlankCount * iAutoWeight);

                comp.items.forEach((item, index) => {
                    let itemW = (item.weight !== '' && item.weight !== null && item.weight !== undefined) ? Number(item.weight) || 0 : iAutoWeight;
                    let max = Number(item.max) || 0;
                    let isEmpty = (item.score === '' || item.score === null || item.score === undefined);
                    let score = !isEmpty ? Number(item.score) || 0 : 0;

                    let itemPctOfComp = totalItemWeightSum > 0 ? (itemW / totalItemWeightSum) : 0;
                    let itemAbsWeight = itemPctOfComp * compPctOfPeriod * periodPctOfSubject * 100;

                    if (!isEmpty) hasAnyInput = true;

                    if (isEmpty) {
                        if (itemAbsWeight > 0) {
                            emptyTargets.push({
                                id: item.id,
                                name: comp.items.length > 1 ? `${comp.name || 'Component'} (${item.name || `Item ${index + 1}`})` : (comp.name || 'Unnamed Component'),
                                periodName: period.name || 'Unnamed Period',
                                absWeight: itemAbsWeight,
                                sumMax: max > 0 ? max : 100 
                            });
                            absoluteAvailable += itemAbsWeight;
                        }
                    } else {
                        if (max > 0) {
                            let pct = (score / max);
                            absoluteEarned += (pct * itemAbsWeight);
                        }
                    }
                });
            });
        });

        const subjectPercent = totalPeriodWeightSum > 0 ? absoluteEarned : 0;
        const gradeEq = Calculator.interpolateGrade(subjectPercent, Number(subject.passingPercent) || 60, system);
        
        return { 
            percent: subjectPercent, 
            equivalent: gradeEq, 
            hasData: hasAnyInput, 
            absoluteEarned: absoluteEarned, 
            absoluteWeight: 100,
            emptyComponents: emptyTargets,
            absoluteAvailable: absoluteAvailable
        };
    },

    calculatePeriod: (period, passingPercent) => {
        let cExplicitSum = 0, cBlankCount = 0;
        period.components.forEach(c => {
            if (c.weight !== '' && c.weight !== null && c.weight !== undefined) cExplicitSum += Number(c.weight) || 0;
            else cBlankCount++;
        });
        let cAutoWeight = cBlankCount > 0 ? Math.max(0, 100 - cExplicitSum) / cBlankCount : 0;
        let totalCompWeightSum = cExplicitSum + (cBlankCount * cAutoWeight);
        
        let earnedCompPercent = 0;

        const comps = period.components.map(comp => {
            const compWeight = (comp.weight !== '' && comp.weight !== null && comp.weight !== undefined) ? Number(comp.weight) || 0 : cAutoWeight;
            
            let compHasInput = false;
            let iExplicitSum = 0, iBlankCount = 0;

            comp.items.forEach(it => { 
                if (it.score !== '' && it.score !== null && it.score !== undefined) compHasInput = true;
                if (it.weight !== '' && it.weight !== null && it.weight !== undefined) iExplicitSum += Number(it.weight) || 0;
                else iBlankCount++;
            });
            
            let iAutoWeight = iBlankCount > 0 ? Math.max(0, 100 - iExplicitSum) / iBlankCount : 0;
            let totalItemWeightSum = iExplicitSum + (iBlankCount * iAutoWeight);
            let earnedItemPercent = 0;
            
            comp.items.forEach(item => {
                let itemW = (item.weight !== '' && item.weight !== null && item.weight !== undefined) ? Number(item.weight) || 0 : iAutoWeight;
                let max = Number(item.max) || 0;
                let score = (item.score !== '' && item.score !== null && item.score !== undefined) ? Number(item.score) || 0 : 0;
                
                if (max > 0) {
                    let pct = (score / max) * 100;
                    earnedItemPercent += pct * (itemW / 100);
                }
            });

            const pct = totalItemWeightSum > 0 ? (earnedItemPercent / (totalItemWeightSum / 100)) : 0;
            const contrib = compHasInput ? (pct * (compWeight / 100)) : 0; 
            
            if (compHasInput) {
                earnedCompPercent += contrib;
            }
            
            return { id: comp.id, name: comp.name, weight: compWeight, percent: pct, contrib, hasData: compHasInput };
        });

        const periodPercent = totalCompWeightSum > 0 ? (earnedCompPercent / (totalCompWeightSum / 100)) : 0;
        const passing = Number(passingPercent) || 60;
        const gap = passing - periodPercent;

        return {
            comps, percent: periodPercent, totalWeight: totalCompWeightSum, hasData: comps.some(c => c.hasData), passing, gap
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
    if (system === '4_IS_BEST') { const clamped = Math.max(0, Math.min(4, gwa)); return clamped / 4; }
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
        if (gwa >= 60) return 'ok'; return 'warn';
    }
    if (system === '4_IS_BEST') {
        if (gwa >= 3.25) return 'excellent'; 
        if (gwa >= 2.125) return 'good';     
        if (gwa >= 1.0) return 'ok'; return 'warn';
    }
    if (system === '1_IS_BEST') {
        if (gwa <= 1.5) return 'excellent';  
        if (gwa <= 2.25) return 'good';      
        if (gwa <= 3.0) return 'ok'; return 'warn';
    } else { 
        if (gwa >= 4.5) return 'excellent';  
        if (gwa >= 3.75) return 'good';      
        if (gwa >= 3.0) return 'ok'; return 'warn';
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
    if (val > 0) displayVal = system === 'PERCENT' ? val.toFixed(1) + '%' : val.toFixed(3);

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

const getWeightWarning = (explicitSum, blankCount, arrValues, label) => {
    let msgs = [];
    if (blankCount === 0 && Math.abs(explicitSum - 100) > 0.1) msgs.push(`Weights total ${explicitSum}% (should be 100%)`);
    if (explicitSum > 100) msgs.push(`Weights exceed 100%`);
    if (arrValues.some(w => w !== '' && w !== null && w !== undefined && Number(w) === 0)) msgs.push(`A weight is 0%`);
    return msgs.length ? `<div class="weight-warning">⚠️ ${msgs.join(' | ')}</div>` : '';
};

function renderLedger() {
    const container = document.getElementById('ledger-content');
    const year = appData.years.find(y => y.id === state.currentYearId);
    const sem = year?.semesters.find(s => s.id === state.currentSemId);
    const system = appData.settings?.gradingSystem || '1_IS_BEST';

    if (!sem) {
        container.innerHTML = '<p>No data selected. Create a year/semester to begin.</p>';
        return;
    }

    let html = '';

    // ==========================================
    // GRID MENU VIEW
    // ==========================================
    if (!state.currentSubId) {
        html += `<div class="subject-cards-grid">`;
        sem.subjects.forEach(sub => {
            const res = Calculator.calculateSubject(sub, system);
            const tier = res.hasData ? pctTier(res.percent) : 'muted';
            const barW = res.hasData ? Math.max(0, Math.min(100, res.percent)) : 0;
            
            html += `
            <div class="sub-card" data-id="${sub.id}">
                <div class="sub-card-header">
                    <h3 class="sub-card-title">${sub.name || 'Untitled Subject'}</h3>
                    <div class="header-actions">
                        <button class="btn-duplicate btn-duplicate--tiny" data-action="duplicate-sub" data-path="${year.id}:${sem.id}:${sub.id}" title="Duplicate subject">⧉</button>
                        <button class="btn-delete btn-delete--tiny" data-action="delete-sub" data-path="${year.id}:${sem.id}:${sub.id}" title="Delete subject">&times;</button>
                    </div>
                </div>
                <div class="sub-card-meta">
                    ${sub.periods.length} periods &middot; Passing ${sub.passingPercent}%
                </div>
                <div class="sub-card-progress">
                    <div class="bar">
                        <div class="fill tier-${tier}" style="width:${barW.toFixed(1)}%"></div>
                    </div>
                </div>
            </div>`;
        });
        
        html += `
            <div class="sub-card btn-add-sub-card" data-action="add-sub" data-path="${year.id}:${sem.id}">
                <span>+ Add Subject</span>
            </div>
        </div>`;
        
        container.innerHTML = html;
        return;
    }

    // ==========================================
    // ACTIVE SUBJECT VIEW
    // ==========================================
    const sub = sem.subjects.find(s => s.id === state.currentSubId);
    if (!sub) {
        state.currentSubId = null;
        updateUI();
        return;
    }

    const res = Calculator.calculateSubject(sub, system);
    const tier = res.hasData ? pctTier(res.percent) : 'muted';
    const passPct = Number(sub.passingPercent) || 60;
    const barW = res.hasData ? Math.max(0, Math.min(100, res.percent)) : 0;
    const eqText = system === 'PERCENT' ? (res.hasData ? res.equivalent.toFixed(1) + '%' : 'no data') : (res.hasData ? 'GE ' + res.equivalent.toFixed(2) : 'no data');
    const stampText = system === 'PERCENT' ? `${res.percent.toFixed(1)}%` : `${res.percent.toFixed(1)}% &rarr; ${res.equivalent.toFixed(2)}`;

    let pExplicit = 0, pBlank = 0;
    sub.periods.forEach(p => { if (p.weight !== '' && p.weight !== null && p.weight !== undefined) pExplicit += Number(p.weight) || 0; else pBlank++; });
    let pWarning = getWeightWarning(pExplicit, pBlank, sub.periods.map(p => p.weight), 'Period');

    html += `
    <div class="active-subject-nav">
        <button class="btn-back" data-action="back-to-subjects">&larr; Back to Subjects Menu</button>
    </div>`;

    html += `
    <div class="subject-block">
        <div class="header-row">
            <span class="hierarchy-badge badge-subject">SUBJECT</span>
            <h2><input type="text" class="field field--subject" data-path="subName:${year.id}:${sem.id}:${sub.id}" value="${sub.name}" placeholder="Subject Name"></h2>
            <div class="header-actions">
                <button class="btn-duplicate" data-action="duplicate-sub" data-path="${year.id}:${sem.id}:${sub.id}" aria-label="Duplicate subject" title="Duplicate subject">⧉</button>
                <button class="btn-delete" data-action="delete-sub" data-path="${year.id}:${sem.id}:${sub.id}" aria-label="Delete subject" title="Delete subject">&times;</button>
            </div>
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
            <div class="inline-setting">Units <input type="number" class="field w-xs" data-path="subUnits:${year.id}:${sem.id}:${sub.id}" value="${sub.units}"></div>
            <span class="divider">&middot;</span>
            <div class="inline-setting">Pass % <input type="number" class="field w-xs" data-path="subPass:${year.id}:${sem.id}:${sub.id}" value="${sub.passingPercent}"></div>
            ${pWarning}
        </div>

        <div class="subject-content">
${sub.periods.map(per => {
                const pd = Calculator.calculatePeriod(per, sub.passingPercent);
                const perTier = pd.hasData ? pctTier(pd.percent) : 'muted';
                const gradeChip = pd.hasData ? `<span class="period-chip tier-${perTier}">${pd.percent.toFixed(2)}</span>` : '';

                let pAutoW = pBlank > 0 ? (Math.max(0, 100 - pExplicit) / pBlank) : 0;

                let cExplicit = 0, cBlank = 0;
                per.components.forEach(c => { if (c.weight !== '' && c.weight !== null && c.weight !== undefined) cExplicit += Number(c.weight) || 0; else cBlank++; });
                let cWarning = getWeightWarning(cExplicit, cBlank, per.components.map(c => c.weight), 'Component');

                const breakdownList = pd.hasData ? `
                    <div class="breakdown-list">
                        ${pd.comps.map(c => {
                            const cTier = c.hasData ? pctTier(c.percent) : 'muted';
                            return `
                            <div class="bd-row">
                                <div class="bd-main">
                                    <div class="bd-name">${c.name || 'Untitled'}</div>
                                    <div class="bd-meta">${c.weight.toFixed(1)}% weight &mdash; contributes ${c.contrib.toFixed(1)} pts</div>
                                    <div class="bd-track"><div class="bd-fill tier-${cTier}" style="width:${Math.max(0,Math.min(100,c.percent)).toFixed(1)}%"></div></div>
                                </div>
                                <div class="bd-val tier-${cTier}">${c.hasData ? c.percent.toFixed(1) : '-'}</div>
                            </div>`;
                        }).join('')}
                    </div>` : `<div class="breakdown-empty">Add scores to see the period breakdown.</div>`;

                const periodGradeCard = pd.hasData ? `
                    <div class="period-grade tier-${perTier}" style="margin-top: 24px;">
                        <div class="pg-label">Period Grade${per.weight !== '' && per.weight !== undefined ? ` (${per.weight}% of subject)` : ` (${pAutoW.toFixed(1)}% auto)`}</div>
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
                        <button class="btn-toggle-sub" data-action="toggle-period" data-path="${year.id}:${sem.id}:${sub.id}:${per.id}" aria-label="Toggle period">
                            ${per.isCollapsed ? '▶' : '▼'}
                        </button>
                        <span class="hierarchy-badge badge-period">PERIOD</span>
                        <h3><input type="text" class="field field--period" data-path="perName:${year.id}:${sem.id}:${sub.id}:${per.id}" value="${per.name}"></h3>
                        <div class="header-actions">
                            <button class="btn-duplicate btn-duplicate--tiny" data-action="duplicate-period" data-path="${year.id}:${sem.id}:${sub.id}:${per.id}" aria-label="Duplicate period" title="Duplicate period">⧉</button>
                            <button class="btn-delete btn-delete--tiny" data-action="delete-period" data-path="${year.id}:${sem.id}:${sub.id}:${per.id}" aria-label="Delete period">&times;</button>
                        </div>
                        <div class="inline-setting">Weight <input type="number" step="1" class="field field--weight" style="width: 70px;" data-path="perWeight:${year.id}:${sem.id}:${sub.id}:${per.id}" value="${per.weight !== undefined ? per.weight : ''}" placeholder="${pAutoW.toFixed(1)}%">%</div>
                        ${cWarning}
                        <div class="period-grade-inline">
                            <span class="pgi-label">Period Grade</span>
                            ${gradeChip || '<span class="period-chip tier-muted">-</span>'}
                        </div>
                    </div>
                    
                    <div class="period-grid" style="display: ${per.isCollapsed ? 'none' : 'grid'};">
                        <div class="period-inputs">
                            ${per.components.map(comp => {
                                let cAutoW = cBlank > 0 ? (Math.max(0, 100 - cExplicit) / cBlank) : 0;
                                
                                let iExplicit = 0, iBlank = 0;
                                comp.items.forEach(i => { if (i.weight !== '' && i.weight !== null && i.weight !== undefined) iExplicit += Number(i.weight) || 0; else iBlank++; });
                                let iWarning = getWeightWarning(iExplicit, iBlank, comp.items.map(i => i.weight), 'Item');

                                return `
                                <div class="component-block">
                                    <div class="header-row">
                                        <button class="btn-toggle-sub" data-action="toggle-comp" data-path="${year.id}:${sem.id}:${sub.id}:${per.id}:${comp.id}" aria-label="Toggle component">
                                            ${comp.isCollapsed ? '▶' : '▼'}
                                        </button>
                                        <span class="hierarchy-badge badge-comp">COMPONENT</span>
                                        <h4><input type="text" class="field field--component" data-path="compName:${year.id}:${sem.id}:${sub.id}:${per.id}:${comp.id}" value="${comp.name}"></h4>
                                        <div class="header-actions">
                                            <button class="btn-delete btn-delete--tiny" data-action="delete-comp" data-path="${year.id}:${sem.id}:${sub.id}:${per.id}:${comp.id}" aria-label="Delete component">&times;</button>
                                        </div>
                                        <div class="inline-setting">Weight <input type="number" step="1" class="field field--weight" style="width: 70px;" data-path="compWeight:${year.id}:${sem.id}:${sub.id}:${per.id}:${comp.id}" value="${comp.weight !== undefined ? comp.weight : ''}" placeholder="${cAutoW.toFixed(1)}%">%</div>
                                        ${iWarning}
                                        ${comp.isCollapsed ? `<div class="inline-setting" style="margin-left: auto;">${comp.items.length} item(s)</div>` : ''}
                                    </div>
                                    <div class="comp-content-wrapper" style="display: ${comp.isCollapsed ? 'none' : 'block'};">
                                        <div class="items-container">
                                            ${comp.items.map((item, idx) => {
                                                let iAutoW = iBlank > 0 ? (Math.max(0, 100 - iExplicit) / iBlank) : 0;
                                                
                                                return `
                                                <div class="item-row">
                                                    <input type="text" class="field hierarchy-badge badge-item" data-path="itemName:${year.id}:${sem.id}:${sub.id}:${per.id}:${comp.id}:${item.id}" value="${item.name || ''}" placeholder="Item ${idx + 1}" size="${Math.max((item.name || `Item ${idx + 1}`).length, 4)}">
                                                    <div class="item-inputs">
                                                        <input type="number" class="field w-sm" data-path="score:${year.id}:${sem.id}:${sub.id}:${per.id}:${comp.id}:${item.id}" value="${item.score}" placeholder="-">
                                                        <span class="slash">/</span>
                                                        <input type="number" class="field w-sm" data-path="max:${year.id}:${sem.id}:${sub.id}:${per.id}:${comp.id}:${item.id}" value="${item.max}">
                                                    </div>
                                                    <div class="inline-setting">
                                                        <span style="color: var(--text-muted); margin-left: 8px; font-size: 11px;">Wt:</span>
                                                        <input type="number" step="1" class="field" style="width: 70px;" data-path="itemWeight:${year.id}:${sem.id}:${sub.id}:${per.id}:${comp.id}:${item.id}" value="${item.weight !== undefined ? item.weight : ''}" placeholder="${iAutoW.toFixed(1)}%">%
                                                    </div>
                                                    <div class="header-actions">
                                                        <button class="btn-delete btn-delete--tiny" data-action="delete-item" data-path="${year.id}:${sem.id}:${sub.id}:${per.id}:${comp.id}:${item.id}" aria-label="Delete item">&times;</button>
                                                    </div>
                                                </div>
                                            `}).join('')}
                                        </div>
                                        <button class="btn-add" data-action="add-item" data-path="${year.id}:${sem.id}:${sub.id}:${per.id}:${comp.id}">+ Add Item</button>
                                    </div>
                                </div>
                            `}).join('')}
                            <button class="btn-add" data-action="add-comp" data-path="${year.id}:${sem.id}:${sub.id}:${per.id}">+ Add Component</button>
                            ${periodGradeCard} 
                        </div>
                        <aside class="period-summary">
                            <div class="breakdown-title">Period Breakdown</div>
                            ${breakdownList}
                        </aside>
                    </div>
                </div>`;
            }).join('')}
            <button class="btn-add" data-action="add-period" data-path="${year.id}:${sem.id}:${sub.id}" style="margin-bottom: 24px;">+ Add Period</button>

            ${(() => {
                const isGpaSystem = system !== 'PERCENT';
                const targetMode = sub.targetMode || 'PERCENT';
                let targetValue = sub.targetValue;
                if (targetValue === undefined) targetValue = isGpaSystem && targetMode === 'GPA' ? 1.0 : (Number(sub.passingPercent) || 60);

                let targetPercent = targetMode === 'GPA' && isGpaSystem 
                    ? Calculator.percentFromGpa(Number(targetValue), Number(sub.passingPercent) || 60, system)
                    : Number(targetValue);

                const needed = targetPercent - res.absoluteEarned;
                const remainingWeight = res.absoluteAvailable;
                
                let targetMsg = '';
                let distributionHtml = '';

                const buildDistributionHtml = (emptyComps, reqPct, goalText) => {
                    if (emptyComps.length === 0) return '';
                    return `
                    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--divider); width: 100%;">
                        <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 12px;">Required component scores ${goalText}:</div>
                        <div style="display: grid; gap: 8px; font-size: 13px;">
                            ${emptyComps.map(c => {
                                const scoreNeeded = reqPct * c.sumMax;
                                return `
                                <div style="display: flex; justify-content: space-between; align-items: center; background: var(--surface-2); padding: 8px 12px; border-radius: 6px; border: 1px dashed var(--border-strong);">
                                    <span style="font-weight: 500;">${c.periodName} &mdash; ${c.name}</span>
                                    <span style="font-family: var(--font-data); font-weight: 600; color: var(--primary);">
                                        ${scoreNeeded.toFixed(1)} <span style="color: var(--text-subtle); font-size: 12px; font-weight: 400;">/ ${c.sumMax}</span> 
                                        <span style="margin-left: 8px; font-size: 11px; background: var(--primary-soft); color: var(--primary); padding: 2px 6px; border-radius: 4px;">${(reqPct * 100).toFixed(1)}%</span>
                                    </span>
                                </div>`;
                            }).join('')}
                        </div>
                    </div>`;
                };

                if (needed <= 0) targetMsg = `<span class="ok-ico">✓</span> You have reached your desired grade!`;
                else if (remainingWeight <= 0 && needed > 0) targetMsg = `<span class="warn-ico">⚠</span> All components are filled. Your target grade cannot be reached.`;
                else if (needed > remainingWeight) {
                    const passNeeded = (Number(sub.passingPercent) || 60) - res.absoluteEarned;
                    if (passNeeded <= 0) targetMsg = `<span class="warn-ico">⚠</span> Desired grade is impossible, but you have already passed this subject!`;
                    else if (passNeeded > remainingWeight) targetMsg = `<span class="warn-ico" style="color: var(--danger);">⚠</span> Desired grade is impossible, and unfortunately, you cannot pass this subject anymore.`;
                    else {
                        targetMsg = `<span class="warn-ico">⚠</span> Desired grade is impossible, but you can still pass this subject!`;
                        distributionHtml = buildDistributionHtml(res.emptyComponents, passNeeded / remainingWeight, 'to pass the subject');
                    }
                } else {
                    targetMsg = `You need <strong>${needed.toFixed(1)}</strong> more points (out of the remaining ${remainingWeight.toFixed(1)}% weight) to reach ${targetPercent.toFixed(1)}%.`;
                    distributionHtml = buildDistributionHtml(res.emptyComponents, needed / remainingWeight, 'for your desired grade');
                }

                return `
                <div class="target-calculator" style="display: block;">
                    <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
                        <div class="tc-header">Subject Target Tracker</div>
                        <div class="tc-body" style="margin-left: 10px; gap: 8px;">
                            ${isGpaSystem ? `
                                <select class="field" data-path="subTargetMode:${year.id}:${sem.id}:${sub.id}" style="width: auto;">
                                    <option value="PERCENT" ${targetMode === 'PERCENT' ? 'selected' : ''}>Target %</option>
                                    <option value="GPA" ${targetMode === 'GPA' ? 'selected' : ''}>Target GPA</option>
                                </select>
                            ` : ''}
                            <label>Goal: <input type="number" class="field w-xs" data-path="subTargetVal:${year.id}:${sem.id}:${sub.id}" value="${targetValue}" step="${targetMode === 'GPA' ? '0.01' : '1'}"></label>
                            <div class="tc-result">${targetMsg}</div>
                        </div>
                    </div>
                    ${distributionHtml}
                </div>`;
            })()}
        </div>
    </div>`;

    container.innerHTML = html;
}

function updateUI() {
    document.getElementById('global-grade-system').value = appData.settings?.gradingSystem || '1_IS_BEST';
    renderTabs();
    renderLedger();
    renderDashboard();
    Storage.setRecord(appData);
}

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
            state.currentSubId = null;
        } else if (tab.dataset.type === 'sem') {
            state.currentSemId = tab.dataset.id;
            state.currentSubId = null;
        }
        updateUI();
        return;
    }

    const subCard = e.target.closest('.sub-card');
    if (subCard && !e.target.closest('.header-actions') && !subCard.classList.contains('btn-add-sub-card')) {
        state.currentSubId = subCard.dataset.id;
        updateUI();
    }
});

document.addEventListener('click', async (e) => {
    const action = e.target.dataset.action;
    if (!action) return;
    const path = e.target.dataset.path?.split(':');
    
    if (action === 'back-to-subjects') {
        state.currentSubId = null;
        updateUI();
        return;
    }

    if (action === 'toggle-period') {
        const y = path ? appData.years.find(y => y.id === path[0]) : null;
        const s = y ? y.semesters.find(s => s.id === path[1]) : null;
        const sub = s ? s.subjects.find(sub => sub.id === path[2]) : null;
        const p = sub ? sub.periods.find(p => p.id === path[3]) : null;
        if (p) {
            p.isCollapsed = !p.isCollapsed;
            updateUI();
        }
        return;
    }

    if (action === 'toggle-comp') {
        const y = path ? appData.years.find(y => y.id === path[0]) : null;
        const s = y ? y.semesters.find(s => s.id === path[1]) : null;
        const sub = s ? s.subjects.find(sub => sub.id === path[2]) : null;
        const p = sub ? sub.periods.find(p => p.id === path[3]) : null;
        const c = p ? p.components.find(c => c.id === path[4]) : null;
        if (c) {
            c.isCollapsed = !c.isCollapsed;
            updateUI();
        }
        return;
    }

    if (action === 'duplicate-sub') {
        const s = appData.years.find(y => y.id === path[0]).semesters.find(sem => sem.id === path[1]);
        const subToCopy = s.subjects.find(sub => sub.id === path[2]);
        if (subToCopy) {
            const newSub = JSON.parse(JSON.stringify(subToCopy));
            newSub.id = generateId();
            newSub.name = (newSub.name || 'Untitled') + ' (Copy)';
            newSub.periods.forEach(p => {
                p.id = generateId();
                p.components.forEach(c => {
                    c.id = generateId();
                    c.items.forEach(i => i.id = generateId());
                });
            });
            const index = s.subjects.findIndex(sub => sub.id === path[2]);
            s.subjects.splice(index + 1, 0, newSub);
            updateUI();
        }
        return;
    }

    if (action === 'duplicate-period') {
        const sub = appData.years.find(y => y.id === path[0]).semesters.find(sem => sem.id === path[1]).subjects.find(s => s.id === path[2]);
        const perToCopy = sub.periods.find(p => p.id === path[3]);
        if (perToCopy) {
            const newPer = JSON.parse(JSON.stringify(perToCopy));
            newPer.id = generateId();
            newPer.name = (newPer.name || 'Period') + ' (Copy)';
            newPer.components.forEach(c => {
                c.id = generateId();
                c.items.forEach(i => i.id = generateId());
            });
            const index = sub.periods.findIndex(p => p.id === path[3]);
            sub.periods.splice(index + 1, 0, newPer);
            updateUI();
        }
        return;
    }
    
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
            state.currentSubId = null;
        } else if (action === 'add-sem') {
            const currentYear = appData.years.find(y => y.id === state.currentYearId);
            const newSem = { id: generateId(), name: 'New Sem', subjects: [] };
            currentYear.semesters.push(newSem);
            state.currentSemId = newSem.id;
            state.currentSubId = null;
        } else if (action === 'add-sub') {
            const newSubId = generateId();
            s.subjects.push({ id: newSubId, name: 'New Subject', units: 3, passingPercent: 60, periods: [] });
            state.currentSubId = newSubId;
        } else if (action === 'add-period') {
            sub.periods.push({ id: generateId(), name: 'New Period', weight: '', isCollapsed: false, components: [] });
        } else if (action === 'add-comp') {
            p.components.push({ id: generateId(), name: 'New Comp', weight: '', isCollapsed: false, items: [] });
        } else if (action === 'add-item') {
            c.items.push({ id: generateId(), name: '', score: '', max: 100, weight: '' });
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
                state.currentSubId = null;
            }
        } else if (action === 'delete-sem') {
            const y = appData.years.find(y => y.id === path[0]);
            y.semesters = y.semesters.filter(s => s.id !== path[1]);
            if (state.currentSemId === path[1]) {
                state.currentSemId = y.semesters[0]?.id || null;
                state.currentSubId = null;
            }
        } else if (action === 'delete-sub') {
            const s = appData.years.find(y => y.id === path[0]).semesters.find(s => s.id === path[1]);
            s.subjects = s.subjects.filter(sub => sub.id !== path[2]);
            if (state.currentSubId === path[2]) {
                state.currentSubId = null; 
            }
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
    
    if (field === 'subTargetMode') sub.targetMode = val;
    if (field === 'subTargetVal') sub.targetValue = val;
    
    if (field === 'perName') p.name = val;
    if (field === 'perWeight') p.weight = val;
    if (field === 'compName') c.name = val;
    if (field === 'compWeight') c.weight = val;
    if (field === 'itemName') item.name = val;
    if (field === 'score') item.score = val;
    if (field === 'max') item.max = val;
    if (field === 'itemWeight') item.weight = val;

    updateUI();
});

document.addEventListener('input', (e) => {
    if (e.target.type === 'text' && !e.target.classList.contains('field--sub-card')) {
        e.target.size = Math.max(e.target.value.length, 4);
    }
});

// UX focus management to automatically wipe out matched defaults upon focusing
document.addEventListener('focusin', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.classList.contains('field')) {
        const path = e.target.dataset.path || '';
        
        // Exclude specific placeholder weights which are handled differently
        if (path.includes('Weight')) {
            if (e.target.value === '') {
                const autoVal = e.target.placeholder.replace('%', '');
                e.target.value = autoVal;
                e.target.select(); 
            }
        } else {
            if (KNOWN_DEFAULTS.includes(e.target.value)) {
                e.target.dataset.prevValue = e.target.value;
                e.target.value = '';
            } else {
                e.target.select(); 
            }
        }
    }
});

document.addEventListener('focusout', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.classList.contains('field')) {
        const path = e.target.dataset.path || '';
        
        // Specific cleanup for auto-weight behavior
        if (path.includes('Weight')) {
            const autoVal = e.target.placeholder.replace('%', '');
            if (e.target.value !== '' && Number(e.target.value).toFixed(1) === Number(autoVal).toFixed(1)) {
                e.target.value = '';
                e.target.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } else {
            // Restore default known values if left empty
            if (e.target.value === '' && e.target.dataset.prevValue !== undefined) {
                e.target.value = e.target.dataset.prevValue;
                e.target.dispatchEvent(new Event('change', { bubbles: true }));
            }
            delete e.target.dataset.prevValue;
        }
    }
});

document.getElementById('btn-reset').addEventListener('click', async () => {
    const proceed = await customConfirm('Are you sure you want to clear all ledger data? This cannot be undone.');
    if (proceed) {
        await Storage.clearRecords();
        appData = getInitialData();
        state.currentYearId = appData.years[0].id;
        state.currentSemId = appData.years[0].semesters[0].id;
        state.currentSubId = null;
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
    state.currentSubId = null; // Always load fresh into the Menu Grid

    updateUI();
}

initApp();