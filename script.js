// --- ESTADO ---
let investments = [];
let transactions = [];
let plans = []; // NOVO: Metas
let balanceReinvest = 0;
let balancePersonal = 0;

// Configuração da Evolução e Paginação
let evolutionPage = 1;
const ITEMS_PER_PAGE = 20;
let filteredEvolutionData = []; // Armazena dados filtrados para paginar

// IMPORTANTE: Substitua pela NOVA URL do seu App Script
const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbzW-kPYS2xDqSyEjE04iwL_FXR_ZaRqKeXdw5XadLH47QobjHHNbI-biORVsgNBHVaIxg/exec"; 

// Gráficos
let pieChartInstance = null;
let barChartInstance = null;
let evolutionChartInstance = null;
let compBarChartInstance = null; // Novo gráfico comparativo

window.onload = function() {
    investments = JSON.parse(localStorage.getItem('investments')) || [];
    transactions = JSON.parse(localStorage.getItem('transactions')) || [];
    plans = JSON.parse(localStorage.getItem('plans')) || [];
    
    // Define datas padrão nos filtros de Evolução (Últimos 12 meses)
    const today = new Date();
    const lastYear = new Date();
    lastYear.setFullYear(today.getFullYear() - 1);
    
    const inpStart = document.getElementById('filterStartDate');
    const inpEnd = document.getElementById('filterEndDate');
    if(inpStart && inpEnd) {
        inpStart.value = lastYear.toISOString().split('T')[0];
        inpEnd.value = today.toISOString().split('T')[0]; // Hoje
    }

    recalculateBalances();
    renderAll();
    loadFromSheet(); 
};

function showPage(pageId, element) {
    document.querySelectorAll('.page-section').forEach(section => section.classList.remove('active-section'));
    if(element) {
        document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
        element.classList.add('active');
    }
    document.getElementById(pageId).classList.add('active-section');
    
    if(pageId === 'dashboard') updateDashboard();
    if(pageId === 'evolucao') updateEvolutionChart();
    if(pageId === 'comparativo') updateComparisonDashboard();
}

// ... (Funções checkPasswordAndShowConfig e goToAportes mantidas iguais) ...
function checkPasswordAndShowConfig(element) {
    const pwd = prompt("Senha:"); if(pwd === '2915') showPage('config', element);
}
function goToAportes() { const m = document.querySelectorAll('.menu-item'); if(m[5]) showPage('aportes', m[5]); } // Ajuste o índice se necessário

function recalculateBalances() {
    balanceReinvest = 0; balancePersonal = 0;
    transactions.forEach(t => {
        const val = parseFloat(t.value);
        if (t.wallet === 'reinvest') t.type === 'deposit' ? balanceReinvest += val : balanceReinvest -= val;
        else if (t.wallet === 'personal') t.type === 'deposit' ? balancePersonal += val : balancePersonal -= val;
    });
}

// --- TRANSAÇÕES (MANTIDO) ---
function handleTransaction(type, walletType) {
    // ... (Lógica igual ao anterior, resumida aqui) ...
    const valStr = prompt("Valor:"); if(!valStr) return;
    const value = parseFloat(valStr.replace(',', '.'));
    if(isNaN(value) || value <= 0) return alert("Inválido");
    
    if(type === 'withdraw') {
        const cur = walletType === 'reinvest' ? balanceReinvest : balancePersonal;
        if(value > cur) return alert("Saldo insuficiente");
    }

    const newTrans = { dataType: 'transaction', id: Date.now(), date: new Date().toLocaleDateString('pt-BR'), type, wallet: walletType, desc: type==='deposit'?'Manual':'Manual', value };
    transactions.unshift(newTrans);
    recalculateBalances(); saveLocal(); renderAll(); sendToSheet(newTrans);
}

// --- INVESTIMENTOS (MANTIDO) ---
const formInv = document.getElementById('investForm');
if(formInv) {
    formInv.addEventListener('submit', function(e) {
        e.preventDefault();
        const value = parseFloat(document.getElementById('inpValue').value);
        if (value > balanceReinvest) return alert(`Saldo insuficiente (${formatCurrency(balanceReinvest)})`);

        const newInvest = {
            dataType: 'investment', id: Date.now(),
            name: document.getElementById('inpName').value, institution: document.getElementById('inpInst').value,
            type: document.getElementById('inpType').value, date: document.getElementById('inpDate').value,
            expiry: document.getElementById('inpExpiry').value, value: value,
            ratePrev: document.getElementById('inpRatePrev').value, rateTypePrev: document.getElementById('inpRateTypePrev').value,
            status: document.getElementById('inpStatus').value
        };
        const payment = { dataType: 'transaction', id: Date.now()+1, date: new Date().toLocaleDateString('pt-BR'), type: 'withdraw', wallet: 'reinvest', desc: `Invest: ${newInvest.name}`, value };

        investments.push(newInvest); transactions.unshift(payment);
        recalculateBalances(); saveLocal(); 
        document.getElementById('investForm').reset();
        sendToSheet(newInvest); setTimeout(() => sendToSheet(payment), 800);
        alert('Registrado!'); renderAll();
    });
}

// --- NOVO: PLANEJAMENTO ---
const formPlan = document.getElementById('planForm');
if(formPlan) {
    formPlan.addEventListener('submit', function(e) {
        e.preventDefault();
        const monthYear = document.getElementById('inpPlanMonth').value; // YYYY-MM
        if(!monthYear) return alert("Selecione o mês");

        // Cria data dia 01 para salvar padronizado
        const dateObj = new Date(monthYear + '-01'); // YYYY-MM-01
        
        const newPlan = {
            dataType: 'plan',
            id: Date.now(),
            monthYear: dateObj.toISOString().split('T')[0], // YYYY-MM-DD
            targetValue: parseFloat(document.getElementById('inpPlanValue').value),
            category: document.getElementById('inpPlanCategory').value
        };

        plans.push(newPlan);
        saveLocal();
        document.getElementById('planForm').reset();
        sendToSheet(newPlan);
        alert("Meta definida!");
        renderPlansTable();
    });
}

function renderPlansTable() {
    const tbody = document.getElementById('plansTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    // Ordenar por data
    const sortedPlans = [...plans].sort((a,b) => new Date(a.monthYear) - new Date(b.monthYear));

    sortedPlans.forEach(p => {
        const d = p.monthYear.split('-'); // YYYY-MM-DD
        const label = `${d[1]}/${d[0]}`; // MM/YYYY
        tbody.innerHTML += `<tr><td>${label}</td><td>${p.category}</td><td>${formatCurrency(p.targetValue)}</td><td><button class="btn-icon delete" onclick="deletePlan(${p.id})">🗑️</button></td></tr>`;
    });
}

function deletePlan(id) {
    if(!confirm("Apagar meta?")) return;
    plans = plans.filter(p => p.id !== id);
    saveLocal(); renderPlansTable();
}

// --- COMPARATIVO (DASHBOARD) ---
function updateComparisonDashboard() {
    // 1. Agrupar META por Mês (YYYY-MM)
    const plannedMap = {};
    plans.forEach(p => {
        const key = p.monthYear.slice(0, 7); // YYYY-MM
        if(p.category === 'Geral') { // Consideramos apenas Geral ou soma tudo se preferir
            plannedMap[key] = (plannedMap[key] || 0) + p.targetValue;
        }
    });

    // 2. Agrupar REALIZADO por Mês (Baseado na Data do Aporte)
    const realizedMap = {};
    investments.forEach(inv => {
        // inv.date pode ser YYYY-MM-DD
        const key = inv.date.slice(0, 7);
        realizedMap[key] = (realizedMap[key] || 0) + inv.value;
    });

    // 3. Unir chaves e ordenar
    const allKeys = new Set([...Object.keys(plannedMap), ...Object.keys(realizedMap)]);
    const sortedKeys = Array.from(allKeys).sort();

    // 4. Preparar dados
    const labels = sortedKeys.map(k => {
        const p = k.split('-'); return `${p[1]}/${p[0]}`;
    });
    const dataPlanned = sortedKeys.map(k => plannedMap[k] || 0);
    const dataRealized = sortedKeys.map(k => realizedMap[k] || 0);

    // Totais
    const totalP = dataPlanned.reduce((a,b) => a+b, 0);
    const totalR = dataRealized.reduce((a,b) => a+b, 0);
    
    document.getElementById('compTotalPlanned').innerText = formatCurrency(totalP);
    document.getElementById('compTotalRealized').innerText = formatCurrency(totalR);
    const perc = totalP > 0 ? ((totalR / totalP) * 100).toFixed(1) : 0;
    document.getElementById('compPercentage').innerText = perc + '%';

    // Gráfico Comparativo
    const ctx = document.getElementById('compBarChart');
    if(compBarChartInstance) compBarChartInstance.destroy();
    
    compBarChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Meta', data: dataPlanned, backgroundColor: 'rgba(255, 255, 255, 0.2)', borderColor: '#fff', borderWidth: 1 },
                { label: 'Realizado', data: dataRealized, backgroundColor: '#00b894' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { ticks: { color: '#aaa' }, grid: { display:false } } },
            plugins: { legend: { labels: { color: '#fff' } } }
        }
    });
}

// --- EVOLUÇÃO (COM PAGINAÇÃO E NOVOS FILTROS) ---
function updateEvolutionChart() {
    const ctx = document.getElementById('evolutionChart');
    if(!ctx) return;

    // Filtros
    const startStr = document.getElementById('filterStartDate').value;
    const endStr = document.getElementById('filterEndDate').value;
    const typeFilter = document.getElementById('filterType').value;

    const startDate = startStr ? new Date(startStr) : new Date('2000-01-01');
    const endDate = endStr ? new Date(endStr) : new Date('2099-12-31');

    // Filtrar Investimentos
    const filteredInv = investments.filter(inv => {
        const d = new Date(inv.date);
        const matchType = typeFilter === 'all' || inv.type === typeFilter;
        return matchType; // O filtro de data aplicamos na projeção
    });

    // Gerar pontos mês a mês entre Inicio e Fim
    const labels = [];
    const dataPoints = [];
    const tableData = []; // Dados para a tabela

    let current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const endLimit = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);

    let previousValue = 0;

    // Loop mês a mês
    while (current <= endLimit) {
        const labelDate = `${String(current.getMonth()+1).padStart(2,'0')}/${current.getFullYear()}`;
        
        let totalValueInMonth = 0;
        
        filteredInv.forEach(inv => {
            const p = inv.date.split('-');
            const invStart = new Date(p[0], p[1]-1, p[2]);

            // Se o investimento já existia neste mês
            if (current >= invStart) {
                // Se investimento tem vencimento e já passou, não conta (opcional)
                // if (inv.expiry && new Date(inv.expiry) < current) return;

                const diffTime = Math.abs(current - invStart);
                const diffMonths = diffTime / (1000 * 60 * 60 * 24 * 30.44); 
                
                // Taxa (simplificada)
                let rateYearly = 0.10; 
                if (inv.ratePrev) {
                   const r = parseFloat(inv.ratePrev);
                   if (inv.rateTypePrev.includes('CDI')) rateYearly = (r/100)*0.11;
                   else if (inv.rateTypePrev.includes('IPCA')) rateYearly = 0.05 + (r/100);
                   else rateYearly = r/100;
                }
                const rateMonthly = Math.pow(1 + rateYearly, 1/12) - 1;
                totalValueInMonth += inv.value * Math.pow(1 + rateMonthly, diffMonths);
            }
        });

        labels.push(labelDate);
        dataPoints.push(totalValueInMonth);

        const growth = totalValueInMonth - previousValue;
        tableData.push({
            date: labelDate,
            total: totalValueInMonth,
            growth: i === 0 ? 0 : growth
        });
        
        previousValue = totalValueInMonth;
        current.setMonth(current.getMonth() + 1); // Próximo mês
    }

    // Render Gráfico
    if (evolutionChartInstance) evolutionChartInstance.destroy();
    evolutionChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{ label: 'Evolução', data: dataPoints, borderColor: '#00b894', backgroundColor: 'rgba(0,184,148,0.1)', fill: true, tension: 0.4, pointRadius: 3 }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { display: false } }, plugins: { legend: { display: false } } }
    });

    // Preparar Paginação
    filteredEvolutionData = tableData; // Salva globalmente
    evolutionPage = 1; // Reseta página
    renderEvolutionTable();
}

function renderEvolutionTable() {
    const tbody = document.querySelector('#evolutionTable tbody');
    tbody.innerHTML = '';
    
    // Cálculo da fatia (Slice)
    const start = (evolutionPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageData = filteredEvolutionData.slice(start, end);

    pageData.forEach(row => {
        const styleGrowth = row.growth >= 0 ? 'color:var(--accent-green)' : 'color:var(--accent-red)';
        const growthStr = row.growth === 0 ? '-' : (row.growth > 0 ? '+' : '') + formatCurrency(row.growth);
        tbody.innerHTML += `<tr><td>${row.date}</td><td style="font-weight:bold;">${formatCurrency(row.total)}</td><td style="${styleGrowth}">${growthStr}</td></tr>`;
    });

    document.getElementById('pageIndicator').innerText = `Página ${evolutionPage}`;
}

function changePage(direction) {
    const totalPages = Math.ceil(filteredEvolutionData.length / ITEMS_PER_PAGE);
    if (direction === 1 && evolutionPage < totalPages) {
        evolutionPage++;
        renderEvolutionTable();
    } else if (direction === -1 && evolutionPage > 1) {
        evolutionPage--;
        renderEvolutionTable();
    }
}

// --- SYNC / LOAD / SAVE ---
function sendToSheet(dataObj) {
    if (!GOOGLE_SHEET_URL || GOOGLE_SHEET_URL.includes("COLE_SUA")) return;
    fetch(GOOGLE_SHEET_URL, { method: 'POST', mode: 'no-cors', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(dataObj) });
}

function loadFromSheet() {
    if (!GOOGLE_SHEET_URL || GOOGLE_SHEET_URL.includes("COLE_SUA")) return;
    const tb = document.getElementById('investTableBody'); if(tb) tb.style.opacity = '0.5';

    fetch(GOOGLE_SHEET_URL).then(r=>r.json()).then(data => {
        if(data.investments) investments = data.investments;
        if(data.transactions) transactions = data.transactions;
        if(data.plans) plans = data.plans; // NOVO
        
        recalculateBalances(); saveLocal(); renderAll(); renderPlansTable();
        if(document.querySelector('.active-section').id === 'comparativo') updateComparisonDashboard();
    }).finally(() => { if(tb) tb.style.opacity = '1'; });
}

function saveLocal() {
    localStorage.setItem('investments', JSON.stringify(investments));
    localStorage.setItem('transactions', JSON.stringify(transactions));
    localStorage.setItem('plans', JSON.stringify(plans));
}

function renderAll() {
    renderWallets();
    // Render Tabela Histórico Simples
    const tb = document.getElementById('investTableBody');
    if(tb) {
        tb.innerHTML = '';
        investments.forEach(i => tb.innerHTML += `<tr><td>${i.name}</td><td>${i.date}</td><td>${i.expiry||'-'}</td><td>${formatCurrency(i.value)}</td><td><button class="btn-icon delete" onclick="deleteInvestment(${i.id})">🗑️</button></td></tr>`);
    }
    updateDashboard();
}

// ... (Outras funções auxiliares de deletar, formatar moeda mantidas) ...
function formatCurrency(val) { return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function deleteInvestment(id) { if(confirm("Apagar?")) { investments = investments.filter(i=>i.id!==id); saveLocal(); renderAll(); } }
function openTransferModal(id) { /* Mesma lógica anterior */ }
function renderWallets() { /* Mesma lógica anterior, atualizando tabelas */ }
function updateDashboard() { /* Mesma lógica anterior */ }
function updateCharts() { /* Mesma lógica anterior */ }
function clearAllData() { if(confirm("Limpar?")) { localStorage.clear(); location.reload(); } }
