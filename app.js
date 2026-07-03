const SUPABASE_URL = window.ENV_SUPABASE_URL || 'https://rkoeciiwqolgcjduhdqz.supabase.co';
const SUPABASE_ANON_KEY = window.ENV_SUPABASE_KEY || 'sb_publishable_mB9EQATPU3C641O0_XbC2w_oWzrn8Pb';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let isOnline = navigator.onLine;
let hasPendingSync = false;

// --- Theme Management ---
const themeBtn = document.getElementById('btn-theme');
const currentTheme = localStorage.getItem('grade_ledger_theme') || 'light';

const updateThemeIcon = (isDark) => {
    if (!themeBtn) return;
    const sun = themeBtn.querySelector('.icon-sun');
    const moon = themeBtn.querySelector('.icon-moon');
    if (sun && moon) {
        sun.style.display = isDark ? 'block' : 'none';
        moon.style.display = isDark ? 'none' : 'block';
    }
};

if (currentTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
}
updateThemeIcon(currentTheme === 'dark');

if (themeBtn) {
    themeBtn.addEventListener('click', () => {
        let theme = document.documentElement.getAttribute('data-theme');
        if (theme === 'dark') {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('grade_ledger_theme', 'light');
            updateThemeIcon(false);
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('grade_ledger_theme', 'dark');
            updateThemeIcon(true);
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
    document.getElementById('btn-google-login').onclick = async () => {
        const { error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });
        if (error) document.getElementById('auth-message').textContent = error.message;
    };
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
    document.getElementById('btn-forgot-password').onclick = async () => {
        const msg = document.getElementById('auth-message');
        const lastRequest = localStorage.getItem('lastPasswordResetTime');
        const now = Date.now();
        const cooldown = 5 * 60 * 1000; // 5 minutes
        
        if (lastRequest && (now - parseInt(lastRequest)) < cooldown) {
            const remaining = Math.ceil((cooldown - (now - parseInt(lastRequest))) / 1000 / 60);
            msg.textContent = `Please wait ${remaining} minute(s) before requesting another link.`;
            return;
        }

        const email = document.getElementById('auth-email').value;
        if (!email) {
            msg.textContent = 'Please enter your email address first.';
            return;
        }
        
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin
        });
        
        if (error) {
            msg.textContent = error.message;
        } else {
            localStorage.setItem('lastPasswordResetTime', Date.now().toString());
            msg.textContent = 'Password reset email sent. Please check your inbox.';
        }
    };
    document.getElementById('btn-submit-reset').onclick = async () => {
        const newPassword = document.getElementById('new-password').value;
        const msg = document.getElementById('reset-message');
        if (!newPassword || newPassword.length < 6) {
            msg.textContent = 'Password must be at least 6 characters.';
            return;
        }
        
        const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
        if (error) {
            msg.textContent = error.message;
        } else {
            alert('Password updated successfully!');
            document.getElementById('reset-password-modal').style.display = 'none';
        }
    };
    
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
            document.getElementById('reset-password-modal').style.display = 'flex';
        }
    });
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
    // Resolves an item's effective percent (0-1). If the item has been split into
    // sub-items, the percent is the weighted average of those sub-items (weights
    // auto-split evenly across any left blank, same rule as every other level).
    // Otherwise it falls back to the item's own score/max.
    computeItemPercent: (item, exclusions = null) => {
        if (item.subItems && item.subItems.length > 0) {
            let sExplicit = 0, sBlank = 0;
            const validSubs = exclusions ? item.subItems.filter(si => !exclusions.has(si.id)) : item.subItems;
            validSubs.forEach(si => {
                if (si.weight !== '' && si.weight !== null && si.weight !== undefined) sExplicit += Number(si.weight) || 0;
                else sBlank++;
            });
            let sAutoWeight = sBlank > 0 ? Math.max(0, 100 - sExplicit) / sBlank : 0;
            let totalSubWeightSum = sExplicit + (sBlank * sAutoWeight);

            let earned = 0;
            let hasAnyInput = false;
            validSubs.forEach(si => {
                const w = (si.weight !== '' && si.weight !== null && si.weight !== undefined) ? Number(si.weight) || 0 : sAutoWeight;
                const wPct = totalSubWeightSum > 0 ? (w / totalSubWeightSum) : 0;
                
                const subRes = Calculator.computeItemPercent(si, exclusions);
                if (!subRes.isEmpty) hasAnyInput = true;
                if (!subRes.isEmpty) {
                    earned += subRes.percent * wPct;
                }
            });
            return { isEmpty: !hasAnyInput, percent: earned };
        }

        const max = Number(item.max) || 0;
        const isEmpty = (item.score === '' || item.score === null || item.score === undefined);
        const score = !isEmpty ? Number(item.score) || 0 : 0;
        return { isEmpty, percent: max > 0 ? (score / max) : 0 };
    },

    interpolateGrade: (percentage, passingPercent, system) => {
        if (system === 'PERCENT') return percentage;
        
        if (percentage >= 100) {
            if (system === '4_IS_BEST') return 4.0;
            return system === '1_IS_BEST' ? 1.0 : 5.0;
        }
        
        if (percentage < passingPercent) {
            const failRatio = Math.max(0, percentage) / passingPercent;
            if (system === '4_IS_BEST') {
                return failRatio * 1.0; 
            } else if (system === '1_IS_BEST') {
                return 5.0 - (failRatio * 2.0); 
            } else { 
                return 1.0 + (failRatio * 2.0); 
            }
        }
        
        const ratio = (percentage - passingPercent) / (100 - passingPercent);
        if (system === '4_IS_BEST') {
            return 1.0 + (ratio * 3.0); 
        } else if (system === '1_IS_BEST') {
            return 3.0 - (ratio * 2.0);
        } else {
            return 3.0 + (ratio * 2.0);
        }
    },

    percentFromGpa: (gpa, passingPercent, system) => {
        passingPercent = Number(passingPercent) || 60;
        
        if (system === 'PERCENT') return gpa;
        
        let isFail = false;
        if (system === '1_IS_BEST' && gpa > 3.0) isFail = true;
        if (system === '4_IS_BEST' && gpa < 1.0) isFail = true;
        if (system === '5_IS_BEST' && gpa < 3.0) isFail = true;

        if (isFail) {
            let failRatio = 0;
            if (system === '1_IS_BEST') {
                failRatio = Math.max(0, (5.0 - gpa) / 2.0);
            } else if (system === '4_IS_BEST') {
                failRatio = Math.max(0, gpa / 1.0);
            } else if (system === '5_IS_BEST') {
                failRatio = Math.max(0, (gpa - 1.0) / 2.0);
            }
            return failRatio * passingPercent;
        }

        let ratio = 0;
        if (system === '4_IS_BEST') {
            ratio = Math.max(0, Math.min(1, (gpa - 1.0) / 3.0));
        } else if (system === '1_IS_BEST') {
            ratio = Math.max(0, Math.min(1, (3.0 - gpa) / 2.0));
        } else if (system === '5_IS_BEST') {
            ratio = Math.max(0, Math.min(1, (gpa - 3.0) / 2.0));
        }
        return passingPercent + (ratio * (100 - passingPercent));
    },
    
    calculateSubject: (subject, system, exclusions = null) => {
        let absoluteEarned = 0;
        let emptyTargets = [];
        let absoluteAvailable = 0;
        let hasAnyInput = false;

        let pExplicitSum = 0, pBlankCount = 0;
        const validPeriods = exclusions ? subject.periods.filter(p => !exclusions.has(p.id)) : subject.periods;
        validPeriods.forEach(p => {
            if (p.weight !== '' && p.weight !== null && p.weight !== undefined) pExplicitSum += Number(p.weight) || 0;
            else pBlankCount++;
        });
        let pAutoWeight = pBlankCount > 0 ? Math.max(0, 100 - pExplicitSum) / pBlankCount : 0;
        let totalPeriodWeightSum = pExplicitSum + (pBlankCount * pAutoWeight);

        validPeriods.forEach(period => {
            const pWeight = (period.weight !== '' && period.weight !== null && period.weight !== undefined) ? Number(period.weight) || 0 : pAutoWeight;
            const periodPctOfSubject = totalPeriodWeightSum > 0 ? (pWeight / totalPeriodWeightSum) : 0;
            
            let cExplicitSum = 0, cBlankCount = 0;
            const validComps = exclusions ? period.components.filter(c => !exclusions.has(c.id)) : period.components;
            validComps.forEach(c => {
                if (c.weight !== '' && c.weight !== null && c.weight !== undefined) cExplicitSum += Number(c.weight) || 0;
                else cBlankCount++;
            });
            let cAutoWeight = cBlankCount > 0 ? Math.max(0, 100 - cExplicitSum) / cBlankCount : 0;
            let totalCompWeightSum = cExplicitSum + (cBlankCount * cAutoWeight);

            validComps.forEach(comp => {
                const compWeight = (comp.weight !== '' && comp.weight !== null && comp.weight !== undefined) ? Number(comp.weight) || 0 : cAutoWeight;
                const compPctOfPeriod = totalCompWeightSum > 0 ? (compWeight / totalCompWeightSum) : 0;
                
                let iExplicitSum = 0, iBlankCount = 0;
                const validItems = exclusions ? comp.items.filter(i => !exclusions.has(i.id)) : comp.items;
                validItems.forEach(item => {
                    if (item.weight !== '' && item.weight !== null && item.weight !== undefined) iExplicitSum += Number(item.weight) || 0;
                    else iBlankCount++;
                });

                let iAutoWeight = iBlankCount > 0 ? Math.max(0, 100 - iExplicitSum) / iBlankCount : 0;
                let totalItemWeightSum = iExplicitSum + (iBlankCount * iAutoWeight);

                const traverseItem = (node, nodeAbsWeight, prefixLabel) => {
                    if (node.subItems && node.subItems.length > 0) {
                        let sExplicit = 0, sBlank = 0;
                        const validSubs = exclusions ? node.subItems.filter(si => !exclusions.has(si.id)) : node.subItems;
                        validSubs.forEach(si => {
                            if (si.weight !== '' && si.weight !== null && si.weight !== undefined) sExplicit += Number(si.weight) || 0;
                            else sBlank++;
                        });
                        let sAutoWeight = sBlank > 0 ? Math.max(0, 100 - sExplicit) / sBlank : 0;
                        let totalSubWeightSum = sExplicit + (sBlank * sAutoWeight);

                        validSubs.forEach((si, sidx) => {
                            const w = (si.weight !== '' && si.weight !== null && si.weight !== undefined) ? Number(si.weight) || 0 : sAutoWeight;
                            const wPct = totalSubWeightSum > 0 ? (w / totalSubWeightSum) : 0;
                            const subAbsWeight = wPct * nodeAbsWeight;
                            traverseItem(si, subAbsWeight, `${prefixLabel} \u2014 ${si.name || `Sub-item ${sidx + 1}`}`);
                        });
                    } else {
                        const isEmpty = (node.score === '' || node.score === null || node.score === undefined);
                        const max = Number(node.max) || 0;

                        if (!isEmpty) hasAnyInput = true;

                        if (isEmpty) {
                            if (nodeAbsWeight > 0) {
                                emptyTargets.push({
                                    id: node.id,
                                    name: prefixLabel,
                                    periodName: period.name || 'Unnamed Period',
                                    absWeight: nodeAbsWeight,
                                    sumMax: max > 0 ? max : 100
                                });
                                absoluteAvailable += nodeAbsWeight;
                            }
                        } else if (max > 0) {
                            let pct = (Number(node.score) || 0) / max;
                            absoluteEarned += (pct * nodeAbsWeight);
                        }
                    }
                };

                validItems.forEach((item, index) => {
                    let itemW = (item.weight !== '' && item.weight !== null && item.weight !== undefined) ? Number(item.weight) || 0 : iAutoWeight;
                    let itemPctOfComp = totalItemWeightSum > 0 ? (itemW / totalItemWeightSum) : 0;
                    let itemAbsWeight = itemPctOfComp * compPctOfPeriod * periodPctOfSubject * 100;
                    const itemLabel = comp.items.length > 1 ? `${comp.name || 'Component'} (${item.name || `Item ${index + 1}`})` : (comp.name || 'Unnamed Component');

                    traverseItem(item, itemAbsWeight, itemLabel);
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
                const itHasInput = (it.subItems && it.subItems.length > 0)
                    ? it.subItems.some(si => si.score !== '' && si.score !== null && si.score !== undefined)
                    : (it.score !== '' && it.score !== null && it.score !== undefined);
                if (itHasInput) compHasInput = true;
                if (it.weight !== '' && it.weight !== null && it.weight !== undefined) iExplicitSum += Number(it.weight) || 0;
                else iBlankCount++;
            });
            
            let iAutoWeight = iBlankCount > 0 ? Math.max(0, 100 - iExplicitSum) / iBlankCount : 0;
            let totalItemWeightSum = iExplicitSum + (iBlankCount * iAutoWeight);
            let earnedItemPercent = 0;
            
            comp.items.forEach(item => {
                let itemW = (item.weight !== '' && item.weight !== null && item.weight !== undefined) ? Number(item.weight) || 0 : iAutoWeight;
                const ip = Calculator.computeItemPercent(item);
                let pct = ip.percent * 100;
                earnedItemPercent += pct * (itemW / 100);
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

function donutCard(label, val, system, indicatorText = null, isClickable = false) {
    const R = 45;
    const C = Math.PI * 2 * R;
    const ratio = gwaRatio(val, system);
    const offset = C * (1 - ratio);
    const tier = gwaTier(val, system);
    let displayVal = '-';
    if (val > 0) displayVal = system === 'PERCENT' ? val.toFixed(1) + '%' : val.toFixed(3);

    const clickClass = isClickable ? 'gwa-card--clickable' : '';
    const clickAttr = isClickable ? 'data-action="open-exclusions"' : '';
    const indicatorHtml = indicatorText ? `<div class="gwa-indicator">${indicatorText}</div>` : '';

    return `
        <div class="gwa-card ${clickClass}" ${clickAttr}>
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
            ${indicatorHtml}
        </div>`;
}

function getExcludedIdsForNodes(nodes, globalSet) {
    let ids = [];
    if (!globalSet || globalSet.size === 0 || !nodes) return ids;
    const search = (nodesList) => {
        for (let node of nodesList) {
            if (node && globalSet.has(node.id)) ids.push(node.id);
            if (node && node.semesters) search(node.semesters);
            if (node && node.subjects) search(node.subjects);
            if (node && node.periods) search(node.periods);
            if (node && node.components) search(node.components);
            if (node && node.items) search(node.items);
            if (node && node.subItems) search(node.subItems);
        }
    };
    search(nodes);
    return ids;
}

function getExclusionsIndicatorText(excludedIds, searchNodes) {
    if (!excludedIds || excludedIds.length === 0) return null;
    if (excludedIds.length > 2) return 'Multiple exclusions applied';
    
    const names = [];
    const findName = (id, nodes) => {
        if (!nodes) return null;
        for (let node of nodes) {
            if (node && node.id === id) return node.name;
            if (node && node.semesters) { const n = findName(id, node.semesters); if (n) return n; }
            if (node && node.subjects) { const n = findName(id, node.subjects); if (n) return n; }
            if (node && node.periods) { const n = findName(id, node.periods); if (n) return n; }
            if (node && node.components) { const n = findName(id, node.components); if (n) return n; }
            if (node && node.items) { const n = findName(id, node.items); if (n) return n; }
            if (node && node.subItems) { const n = findName(id, node.subItems); if (n) return n; }
        }
        return null;
    };

    for (let id of excludedIds) {
        const name = findName(id, searchNodes);
        if (name) names.push(name.toUpperCase());
        else names.push('Item');
    }
    
    return names.join(', ') + ' excluded';
}

function renderDashboard() {
    const system = appData.settings?.gradingSystem || '1_IS_BEST';
    let cumulativeUnits = 0;
    let cumulativeGrades = 0;
    let yearGwa = 0, semGwa = 0;

    const globalExclusionsSet = new Set(appData.globalExclusions || []);

    appData.years.forEach(year => {
        let yearUnits = 0, yearGrades = 0;
        year.semesters.forEach(sem => {
            let semUnits = 0, semGrades = 0;
            const isCurrentSem = sem.id === state.currentSemId;

            sem.subjects.forEach(sub => {
                const res = Calculator.calculateSubject(sub, system, globalExclusionsSet);
                if (res.hasData) {
                    const u = Number(sub.units) || 1;
                    semUnits += u;
                    semGrades += res.equivalent * u;
                }
            });
            if (isCurrentSem && semUnits > 0) semGwa = semGrades / semUnits;
            yearUnits += semUnits;
            yearGrades += semGrades;
        });
        if (year.id === state.currentYearId && yearUnits > 0) yearGwa = yearGrades / yearUnits;
        cumulativeUnits += yearUnits;
        cumulativeGrades += yearGrades;
    });

    const cumGwa = cumulativeUnits > 0 ? (cumulativeGrades / cumulativeUnits) : 0;
    
    const currentYear = appData.years.find(y => y.id === state.currentYearId);
    const currentSem = currentYear?.semesters.find(s => s.id === state.currentSemId);
    
    const semIds = getExcludedIdsForNodes([currentSem], globalExclusionsSet);
    const yearIds = getExcludedIdsForNodes([currentYear], globalExclusionsSet);
    const cumIds = getExcludedIdsForNodes(appData.years, globalExclusionsSet);

    const semInd = getExclusionsIndicatorText(semIds, [currentSem]);
    const yearInd = getExclusionsIndicatorText(yearIds, [currentYear]);
    const cumInd = getExclusionsIndicatorText(cumIds, appData.years);

    document.getElementById('gwa-summary').innerHTML =
        donutCard('Semester', semGwa, system, semInd, true).replace('data-action="open-exclusions"', 'data-action="open-exclusions" data-scope="semester"') +
        donutCard('Year', yearGwa, system, yearInd, true).replace('data-action="open-exclusions"', 'data-action="open-exclusions" data-scope="year"') +
        donutCard('Cumulative', cumGwa, system, cumInd, true).replace('data-action="open-exclusions"', 'data-action="open-exclusions" data-scope="cumulative"');
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
            const pctDisplay = res.hasData ? res.percent.toFixed(1) + '%' : '-';
            const eqDisplay = res.hasData ? (system === 'PERCENT' ? res.percent.toFixed(1) + '%' : res.equivalent.toFixed(2)) : '-';
            
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
                <div class="sub-card-stats">
                    <div class="sub-card-stat">
                        <span class="stat-label">Score</span>
                        <span class="period-chip tier-${tier}">${pctDisplay}</span>
                    </div>
                    <div class="sub-card-stat">
                        <span class="stat-label">${system === 'PERCENT' ? 'Average' : 'GWA'}</span>
                        <span class="period-chip tier-${tier}">${eqDisplay}</span>
                    </div>
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
                const pdGradeEq = Calculator.interpolateGrade(pd.percent, sub.passingPercent, system);
                const pdDisplayGrade = system === 'PERCENT' ? pd.percent.toFixed(2) + '%' : pdGradeEq.toFixed(2);
                const perTier = pd.hasData ? pctTier(pd.percent) : 'muted';
                const gradeChip = pd.hasData ? `<span class="period-chip tier-${perTier}">${pdDisplayGrade}</span>` : '';

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
                    </div>` : `<div class="breakdown-empty">Add scores to see the ${per.name.toLowerCase()} breakdown.</div>`;

                const pdSubValueHtml = system !== 'PERCENT' ? `<div class="pg-sub-value" style="font-size: 14px; color: var(--text-muted); margin-bottom: 8px;">Score: ${pd.percent.toFixed(2)}%</div>` : '';
                const periodGradeCard = pd.hasData ? `
                    <div class="period-grade tier-${perTier}" style="margin-top: 24px;">
                        <div class="pg-label">Period Grade${per.weight !== '' && per.weight !== undefined ? ` (${per.weight}% of subject)` : ` (${pAutoW.toFixed(1)}% auto)`}</div>
                        <div class="pg-value">${pdDisplayGrade}</div>
                        ${pdSubValueHtml}
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
                        <div class="inline-setting">Weight <input type="number" step="1" class="field field--weight" style="width: 70px;" data-path="perWeight:${year.id}:${sem.id}:${sub.id}:${per.id}" value="${per.weight !== undefined ? per.weight : ''}" placeholder="${pAutoW.toFixed(1)}">%</div>
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
                                        <div class="inline-setting">Weight <input type="number" step="1" class="field field--weight" style="width: 70px;" data-path="compWeight:${year.id}:${sem.id}:${sub.id}:${per.id}:${comp.id}" value="${comp.weight !== undefined ? comp.weight : ''}" placeholder="${cAutoW.toFixed(1)}">%</div>
                                        ${iWarning}
                                        ${comp.isCollapsed ? `<div class="inline-setting" style="margin-left: auto;">${comp.items.length} item(s)</div>` : ''}
                                    </div>
                                    <div class="comp-content-wrapper" style="display: ${comp.isCollapsed ? 'none' : 'block'};">
                                        <div class="items-container">
                                            ${(() => {
                                                const renderItemRecursive = (item, parentPath, depth, idx, weightContext) => {
                                                    let { iExplicit, iBlank } = weightContext;
                                                    let iAutoW = iBlank > 0 ? (Math.max(0, 100 - iExplicit) / iBlank) : 0;
                                                    const hasSub = !!(item.subItems && item.subItems.length > 0);
                                                    const itemPath = `${parentPath}:${item.id}`;

                                                    let subWarning = '';
                                                    let siAutoW = 0;
                                                    let siExplicit = 0, siBlank = 0;
                                                    if (hasSub) {
                                                        item.subItems.forEach(si => { if (si.weight !== '' && si.weight !== null && si.weight !== undefined) siExplicit += Number(si.weight) || 0; else siBlank++; });
                                                        siAutoW = siBlank > 0 ? (Math.max(0, 100 - siExplicit) / siBlank) : 0;
                                                        subWarning = getWeightWarning(siExplicit, siBlank, item.subItems.map(si => si.weight), depth === 0 ? 'Sub-item' : `Sub-item (L${depth+1})`);
                                                    }
                                                    const ip = Calculator.computeItemPercent(item);
                                                    const iWeight = (item.weight !== '' && item.weight !== null && item.weight !== undefined) ? Number(item.weight) || 0 : (weightContext.iBlank > 0 ? Math.max(0, 100 - weightContext.iExplicit) / weightContext.iBlank : 0);
                                                    const earnedPts = (ip.percent * iWeight).toFixed(1);
                                                    const computedDisplay = ip.isEmpty ? '-' : `${(ip.percent * 100).toFixed(1)}% <span style="font-size:11px; font-weight:normal; opacity:0.75; margin-left:4px;">(${earnedPts} pts)</span>`;
                                                    
                                                    const badgeLabel = depth === 0 ? 'ITEM' : `SUB L${depth}`;
                                                    const namePlaceholder = depth === 0 ? `Item ${idx + 1}` : `Sub ${idx + 1}`;
                                                    const badgeClass = depth === 0 ? 'badge-item' : 'badge-subitem';
                                                    
                                                    return `
                                                    <div class="item-row-wrapper">
                                                    <div class="item-row ${depth > 0 ? 'subitem-row' : ''}">
                                                        ${hasSub ? `<button class="btn-toggle-sub" data-action="toggle-item" data-path="${itemPath}" aria-label="Toggle sub-items">${item.isCollapsed ? '▶' : '▼'}</button>` : ''}
                                                        ${depth > 0 ? `<span class="hierarchy-badge badge-subitem">${badgeLabel}</span>` : ''}
                                                        <input type="text" class="field hierarchy-badge ${badgeClass}" data-path="itemName:${itemPath}" value="${item.name || ''}" placeholder="${namePlaceholder}" size="${Math.max((item.name || namePlaceholder).length, 4)}">
                                                        ${hasSub ? `
                                                        <div class="item-inputs item-inputs--computed" title="Computed from ${item.subItems.length} sub-item(s)">
                                                            <span class="computed-score">${computedDisplay}</span>
                                                        </div>` : `
                                                        <div class="item-inputs">
                                                            <input type="number" class="field w-sm" data-path="score:${itemPath}" value="${item.score}" placeholder="-">
                                                            <span class="slash">/</span>
                                                            <input type="number" class="field w-sm" data-path="max:${itemPath}" value="${item.max}">
                                                        </div>`}
                                                        <div class="inline-setting">
                                                            <span style="color: var(--text-muted); margin-left: 8px; font-size: 11px;">Wt:</span>
                                                            <input type="number" step="1" class="field" style="width: 70px;" data-path="itemWeight:${itemPath}" value="${item.weight !== undefined ? item.weight : ''}" placeholder="${iAutoW.toFixed(1)}">%
                                                        </div>
                                                        <div class="header-actions">
                                                            ${(!hasSub && depth < 3) ? `<button class="btn-add btn-subitem--tiny" data-action="add-subitem" data-path="${itemPath}" aria-label="Split into sub-items" title="Split into sub-items">+ Sub</button>` : ''}
                                                            <button class="btn-delete btn-delete--tiny" data-action="delete-item" data-path="${itemPath}" aria-label="Delete item">&times;</button>
                                                        </div>
                                                    </div>
                                                    ${hasSub ? `
                                                    <div class="subitems-container" style="display: ${item.isCollapsed ? 'none' : 'block'};">
                                                        ${subWarning}
                                                        ${item.subItems.map((si, sidx) => renderItemRecursive(si, itemPath, depth + 1, sidx, { iExplicit: siExplicit, iBlank: siBlank })).join('')}
                                                        ${depth < 3 ? `<button class="btn-add" data-action="add-subitem" data-path="${itemPath}" style="margin-left: 28px;">+ Add Sub-item</button>` : ''}
                                                    </div>` : ''}
                                                    </div>
                                                    `;
                                                };

                                                return comp.items.map((item, idx) => 
                                                    renderItemRecursive(item, `${year.id}:${sem.id}:${sub.id}:${per.id}:${comp.id}`, 0, idx, { iExplicit, iBlank })
                                                ).join('');
                                            })()}
                                        </div>
                                        <button class="btn-add" data-action="add-item" data-path="${year.id}:${sem.id}:${sub.id}:${per.id}:${comp.id}">+ Add Item</button>
                                    </div>
                                </div>
                            `}).join('')}
                            <button class="btn-add" data-action="add-comp" data-path="${year.id}:${sem.id}:${sub.id}:${per.id}">+ Add Component</button>
                            ${periodGradeCard} 
                        </div>
                        <aside class="period-summary">
                            <div class="breakdown-title">${per.name} Breakdown</div>
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

const resolveItemPath = (path) => {
    let res = { y: null, s: null, sub: null, p: null, c: null, parentList: null, item: null };
    if (!path || !path.length) return res;

    res.y = appData.years.find(y => y.id === path[0]);
    if (!res.y || path.length === 1) return res;

    res.s = res.y.semesters.find(s => s.id === path[1]);
    if (!res.s || path.length === 2) return res;

    res.sub = res.s.subjects.find(sub => sub.id === path[2]);
    if (!res.sub || path.length === 3) return res;

    res.p = res.sub.periods.find(p => p.id === path[3]);
    if (!res.p || path.length === 4) return res;

    res.c = res.p.components.find(c => c.id === path[4]);
    if (!res.c || path.length === 5) return res;
    
    let currentItem = res.c.items.find(i => i.id === path[5]);
    if (!currentItem) {
        res.parentList = res.c.items;
        return res;
    }

    let parentList = res.c.items;
    for (let idx = 6; idx < path.length; idx++) {
        parentList = currentItem.subItems;
        if (!parentList) {
            res.parentList = parentList;
            res.item = null;
            return res;
        }
        currentItem = parentList.find(i => i.id === path[idx]);
        if (!currentItem) {
            res.parentList = parentList;
            res.item = null;
            return res;
        }
    }

    res.parentList = parentList;
    res.item = currentItem;
    return res;
};

document.addEventListener('click', async (e) => {
    const action = e.target.dataset.action;
    if (!action) return;
    const path = e.target.dataset.path?.split(':');
    
    if (action === 'back-to-subjects') {
        state.currentSubId = null;
        updateUI();
        return;
    }

    if (action === 'open-exclusions') {
        const targetCard = e.target.closest('.gwa-card');
        const scope = targetCard ? targetCard.dataset.scope : 'semester';
        renderExclusionsModal(scope);
        document.getElementById('exclusions-modal').style.display = 'flex';
        return;
    }

    if (action === 'toggle-exc-node') {
        const btn = e.target;
        const node = btn.closest('.exc-node');
        const children = node ? node.nextElementSibling : null;
        if (children && children.classList.contains('exc-children')) {
            const isHidden = children.style.display === 'none';
            children.style.display = isHidden ? 'block' : 'none';
            btn.innerText = isHidden ? '▼' : '▶';
        }
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

    if (action === 'toggle-item') {
        const res = resolveItemPath(path);
        if (res && res.item) {
            res.item.isCollapsed = !res.item.isCollapsed;
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
                    c.items.forEach(i => {
                        i.id = generateId();
                        if (i.subItems) i.subItems.forEach(si => si.id = generateId());
                    });
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
                c.items.forEach(i => {
                    i.id = generateId();
                    if (i.subItems) i.subItems.forEach(si => si.id = generateId());
                });
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
        } else if (action === 'add-subitem') {
            if (path.length >= 9) return; // Prevent adding beyond L3 (depth 3)
            const res = resolveItemPath(path);
            if (res && res.item) {
                if (!res.item.subItems) res.item.subItems = [];
                res.item.subItems.push({ id: generateId(), name: '', score: '', max: 100, weight: '' });
                res.item.isCollapsed = false;
            }
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
        } else if (action === 'delete-item' || action === 'delete-subitem') {
            const res = resolveItemPath(path);
            if (res && res.parentList && res.item) {
                const idx = res.parentList.findIndex(i => i.id === res.item.id);
                if (idx !== -1) res.parentList.splice(idx, 1);
            }
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

    const res = resolveItemPath(parts.slice(1));
    if (!res) return;
    const { y, s, sub, p, c, item } = res;

    if (field === 'year' && y) y.name = val;
    if (field === 'sem' && s) s.name = val;
    if (field === 'subName' && sub) sub.name = val;
    if (field === 'subUnits' && sub) sub.units = val;
    if (field === 'subPass' && sub) sub.passingPercent = val;
    
    if (field === 'subTargetMode' && sub) sub.targetMode = val;
    if (field === 'subTargetVal' && sub) sub.targetValue = val;
    
    if (field === 'perName' && p) p.name = val;
    if (field === 'perWeight' && p) p.weight = val;
    if (field === 'compName' && c) c.name = val;
    if (field === 'compWeight' && c) c.weight = val;
    
    if (item) {
        if (field === 'itemName' || field === 'subItemName') item.name = val;
        if (field === 'score' || field === 'subScore') item.score = val;
        if (field === 'max' || field === 'subMax') item.max = val;
        if (field === 'itemWeight' || field === 'subItemWeight') item.weight = val;
    }

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

function renderExclusionsModal(scope = 'semester') {
    const container = document.getElementById('exclusions-tree-content');
    const title = document.getElementById('exc-modal-title');
    if (!appData.globalExclusions) appData.globalExclusions = [];
    const excList = appData.globalExclusions;
    const isExc = (id) => excList.includes(id) ? '' : 'checked';

    const currentYear = appData.years.find(y => y.id === state.currentYearId);
    const currentSem = currentYear?.semesters.find(s => s.id === state.currentSemId);

    let html = '';

    const renderItems = (items) => {
        let iHtml = '';
        items.forEach((item, idx) => {
            const hasChildren = item.subItems && item.subItems.length > 0;
            iHtml += `
            <div class="exc-node">
                ${hasChildren ? `<button class="exc-toggle" data-action="toggle-exc-node">▶</button>` : `<span class="exc-spacer"></span>`}
                <input type="checkbox" id="exc-${item.id}" data-action="toggle-exclusion" data-id="${item.id}" ${isExc(item.id)}>
                <label for="exc-${item.id}">${item.name || `Item ${idx+1}`}</label>
            </div>`;
            if (hasChildren) {
                iHtml += `<div class="exc-children" style="display: none;">${renderItems(item.subItems)}</div>`;
            }
        });
        return iHtml;
    };

    const renderSubjects = (subjects) => {
        let sHtml = '';
        if (!subjects || subjects.length === 0) return '<div style="color:var(--text-muted); font-size:13px; padding-left:12px;">No subjects.</div>';
        subjects.forEach(sub => {
            const hasChildren = sub.periods && sub.periods.length > 0;
            sHtml += `
            <div class="exc-node exc-subject-node" style="margin-top: 8px;">
                ${hasChildren ? `<button class="exc-toggle" data-action="toggle-exc-node">▶</button>` : `<span class="exc-spacer"></span>`}
                <input type="checkbox" id="exc-${sub.id}" data-action="toggle-exclusion" data-id="${sub.id}" ${isExc(sub.id)}>
                <label for="exc-${sub.id}" style="font-weight:bold;">${sub.name || 'Unnamed Subject'}</label>
            </div>`;
            if (hasChildren) {
                sHtml += `<div class="exc-children" style="display: none;">`;
                sub.periods.forEach(p => {
                    const pHasChildren = p.components && p.components.length > 0;
                    sHtml += `
                    <div class="exc-node">
                        ${pHasChildren ? `<button class="exc-toggle" data-action="toggle-exc-node">▶</button>` : `<span class="exc-spacer"></span>`}
                        <input type="checkbox" id="exc-${p.id}" data-action="toggle-exclusion" data-id="${p.id}" ${isExc(p.id)}>
                        <label for="exc-${p.id}">${p.name || 'Unnamed Period'}</label>
                    </div>`;
                    if (pHasChildren) {
                        sHtml += `<div class="exc-children" style="display: none;">`;
                        p.components.forEach(c => {
                            const cHasChildren = c.items && c.items.length > 0;
                            sHtml += `
                            <div class="exc-node">
                                ${cHasChildren ? `<button class="exc-toggle" data-action="toggle-exc-node">▶</button>` : `<span class="exc-spacer"></span>`}
                                <input type="checkbox" id="exc-${c.id}" data-action="toggle-exclusion" data-id="${c.id}" ${isExc(c.id)}>
                                <label for="exc-${c.id}">${c.name || 'Unnamed Component'}</label>
                            </div>`;
                            if (cHasChildren) {
                                sHtml += `<div class="exc-children" style="display: none;">${renderItems(c.items)}</div>`;
                            }
                        });
                        sHtml += `</div>`;
                    }
                });
                sHtml += `</div>`;
            }
        });
        return sHtml;
    };

    if (scope === 'semester') {
        if (title) title.innerText = 'Semester Grade Exclusions';
        html = renderSubjects(currentSem?.subjects || []);
    } else if (scope === 'year') {
        if (title) title.innerText = 'Year Grade Exclusions';
        if (currentYear) {
            currentYear.semesters.forEach(sem => {
                html += `
                <div class="exc-node" style="margin-top:12px;">
                    <button class="exc-toggle" data-action="toggle-exc-node">▶</button>
                    <input type="checkbox" id="exc-${sem.id}" data-action="toggle-exclusion" data-id="${sem.id}" ${isExc(sem.id)}>
                    <label for="exc-${sem.id}" style="font-weight:bold;">${sem.name || 'Unnamed Semester'}</label>
                </div>`;
                html += `<div class="exc-children" style="display: none;">${renderSubjects(sem.subjects)}</div>`;
            });
        }
    } else if (scope === 'cumulative') {
        if (title) title.innerText = 'Cumulative Grade Exclusions';
        appData.years.forEach(year => {
            html += `
            <div class="exc-node" style="margin-top:16px;">
                <button class="exc-toggle" data-action="toggle-exc-node">▶</button>
                <input type="checkbox" id="exc-${year.id}" data-action="toggle-exclusion" data-id="${year.id}" ${isExc(year.id)}>
                <label for="exc-${year.id}" style="font-weight:bold; color:var(--primary); font-size:15px;">${year.name || 'Unnamed Year'}</label>
            </div>`;
            html += `<div class="exc-children" style="display: none;">`;
            year.semesters.forEach(sem => {
                html += `
                <div class="exc-node" style="margin-top:8px;">
                    <button class="exc-toggle" data-action="toggle-exc-node">▶</button>
                    <input type="checkbox" id="exc-${sem.id}" data-action="toggle-exclusion" data-id="${sem.id}" ${isExc(sem.id)}>
                    <label for="exc-${sem.id}" style="font-weight:bold;">${sem.name || 'Unnamed Semester'}</label>
                </div>`;
                html += `<div class="exc-children" style="display: none;">${renderSubjects(sem.subjects)}</div>`;
            });
            html += `</div>`;
        });
    }

    container.innerHTML = html || '<div style="color:var(--text-muted); font-size:13px; text-align:center; padding: 20px;">No data available.</div>';
}

document.getElementById('btn-exc-close').addEventListener('click', () => {
    document.getElementById('exclusions-modal').style.display = 'none';
    updateUI();
});

document.getElementById('btn-exc-reset').addEventListener('click', () => {
    appData.globalExclusions = [];
    Storage.setRecord(appData);
    
    // Visually reset all checkboxes in the modal without collapsing the tree
    const checkboxes = document.querySelectorAll('#exclusions-tree-content input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = true);
    
    // Instantly update the dashboard to reflect the reset
    updateUI();
});

document.addEventListener('change', (e) => {
    if (e.target.dataset.action === 'toggle-exclusion') {
        const id = e.target.dataset.id;
        const checked = e.target.checked;
        if (!appData.globalExclusions) appData.globalExclusions = [];
        const excList = appData.globalExclusions;
        
        const toggleId = (nodeId, isChecked) => {
            if (isChecked) {
                const idx = excList.indexOf(nodeId);
                if (idx > -1) excList.splice(idx, 1);
            } else {
                if (!excList.includes(nodeId)) excList.push(nodeId);
            }
        };

        toggleId(id, checked);

        const excNode = e.target.closest('.exc-node');
        const nextSib = excNode ? excNode.nextElementSibling : null;
        if (nextSib && nextSib.classList.contains('exc-children')) {
            const childCheckboxes = nextSib.querySelectorAll('input[type="checkbox"]');
            childCheckboxes.forEach(cb => {
                cb.checked = checked;
                toggleId(cb.dataset.id, checked);
            });
        }
        
        Storage.setRecord(appData);
        updateUI(); // Live preview the changes on the dashboard instantly
    }
});

async function initApp() {
    await handleAuth();
    const savedData = await Storage.getRecord();
    appData = savedData || getInitialData();
    
    if (!appData.settings) {
        appData.settings = { gradingSystem: '1_IS_BEST' };
    }
    
    if (appData.exclusions && !appData.globalExclusions) {
        appData.globalExclusions = [];
        for (const semId in appData.exclusions) {
            if (Array.isArray(appData.exclusions[semId])) {
                appData.globalExclusions.push(...appData.exclusions[semId]);
            }
        }
        delete appData.exclusions;
    }
    if (!appData.globalExclusions) {
        appData.globalExclusions = [];
    }

    state.currentYearId = appData.years[0]?.id || null;
    const currentYear = appData.years.find(y => y.id === state.currentYearId);
    state.currentSemId = currentYear?.semesters[0]?.id || null;
    state.currentSubId = null; 

    updateUI();
}

document.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('#btn-menu-toggle');
    const authControls = document.getElementById('auth-controls');
    const menuBtn = document.getElementById('btn-menu-toggle');
    
    if (toggleBtn) {
        authControls.classList.toggle('open');
        menuBtn.classList.toggle('active');
    } else if (authControls && !authControls.contains(e.target) && !e.target.closest('#btn-menu-toggle')) {
        authControls.classList.remove('open');
        menuBtn.classList.remove('active');
    }
});

initApp();