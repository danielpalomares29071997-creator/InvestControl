// --- ESTADO DA APLICAÇÃO ---
let investments = [];
let transactions = [];
let balanceReinvest = 0;
let balancePersonal = 0;

// --- CONFIGURAÇÃO GOOGLE SHEETS ---
// IMPORTANTE: Substitua pela URL do seu App Script
const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbzW-kPYS2xDqSyEjE04iwL_FXR_ZaRqKeXdw5XadLH47QobjHHNbI-biORVsgNBHVaIxg/exec"; 

// Instâncias dos gráficos
let pieChartInstance = null;
let barChartInstance = null;
let evolutionChartInstance = null;

// --- INICIALIZAÇÃO ---
window.onload = function() {
    // Tenta carregar do LocalStorage primeiro para exibir rápido
    const localInv = JSON.parse(localStorage.getItem('investments'));
    const localTrans = JSON.parse(localStorage.getItem('transactions'));
    
    if(localInv) investments = localInv;
    if(localTrans) transactions = localTrans;
    
    recalculateBalances(); // Calcula saldo baseado nas transações
    renderAll();
    
    // Busca dados atualizados da nuvem
    loadFromSheet(); 
};

// --- NAVEGAÇÃO ---
function showPage(pageId, element) {
    document.querySelectorAll('.page-section').forEach(section => section.classList.remove('active-section'));
    if(element) {
        document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
        element.classList.add('active');
    }
    document.getElementById(pageId).classList.add('active-section');
    
    // Atualiza gráficos específicos ao entrar na aba
    if(pageId === 'dashboard') updateDashboard();
    if(pageId === 'evolucao') updateEvolutionChart();
}

function checkPasswordAndShowConfig(element) {
    const pwd = prompt("Digite a senha de administrador:");
    if(pwd === '2915') showPage('config', element);
    else alert("Senha incorreta.");
}

function goToAportes() {
    const menuItems = document.querySelectorAll('.menu-item');
    if(menuItems[4]) showPage('aportes', menuItems[4]); 
}

// --- LÓGICA DE SALDOS ---
function recalculateBalances() {
    balanceReinvest = 0;
    balancePersonal = 0;

    transactions.forEach(t => {
        const val = parseFloat(t.value);
        if (t.wallet === 'reinvest') {
            if (t.type === 'deposit') balanceReinvest += val;
            else balanceReinvest -= val;
        } else if (t.wallet === 'personal') {
            if (t.type === 'deposit') balancePersonal += val;
            else balancePersonal -= val;
        }
    });
}

// --- FUNÇÕES DA CARTEIRA (TRANSAÇÕES) ---
function handleTransaction(type, walletType) {
    const text = type === 'deposit' ? 'Depositar' : 'Sacar';
    const walletName = walletType === 'reinvest' ? 'Carteira de Giro' : 'Carteira Pessoal';
    
    const valueStr = prompt(`${text} em ${walletName}\nQual valor? (Ex: 1000.50)`);
    if (!valueStr) return;
    const value = parseFloat(valueStr.replace(',', '.'));
    
    if (isNaN(value) || value <= 0) { alert('Valor inválido!'); return; }

    if (type === 'withdraw') {
        const currentBalance = walletType === 'reinvest' ? balanceReinvest : balancePersonal;
        if (value > currentBalance) { alert('Saldo insuficiente!'); return; }
    }

    const newTrans = {
        dataType: 'transaction',
        id: Date.now(),
        date: new Date().toLocaleDateString('pt-BR'),
        type: type,
        wallet: walletType,
        desc: type === 'deposit' ? 'Aporte Manual' : 'Retirada Manual',
        value: value
    };

    transactions.unshift(newTrans);
    recalculateBalances();
    saveLocal();
    renderAll();
    sendToSheet(newTrans);
}

// --- FUNÇÕES DE INVESTIMENTO ---
const form = document.getElementById('investForm');
if(form) {
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        const value = parseFloat(document.getElementById('inpValue').value);
        
        if (value > balanceReinvest) {
            alert(`Saldo insuficiente no Giro (${formatCurrency(balanceReinvest)}).`);
            return;
        }

        const newInvest = {
            dataType: 'investment',
            id: Date.now(),
            name: document.getElementById('inpName').value,
            institution: document.getElementById('inpInst').value,
            type: document.getElementById('inpType').value,
            date: document.getElementById('inpDate').value,
            expiry: document.getElementById('inpExpiry').value,
            value: value,
            ratePrev: document.getElementById('inpRatePrev').value,
            rateTypePrev: document.getElementById('inpRateTypePrev').value,
            rateReal: document.getElementById('inpRateReal').value,
            rateTypeReal: document.getElementById('inpRateTypeReal').value,
            status: document.getElementById('inpStatus').value
        };

        const paymentTrans = {
            dataType: 'transaction',
            id: Date.now() + 1,
            date: new Date().toLocaleDateString('pt-BR'),
            type: 'withdraw',
            wallet: 'reinvest',
            desc: `Investimento: ${newInvest.name}`,
            value: value
        };

        investments.push(newInvest);
        transactions.unshift(paymentTrans);
        recalculateBalances();
        saveLocal();
        
        document.getElementById('investForm').reset();
        
        sendToSheet(newInvest);
        setTimeout(() => sendToSheet(paymentTrans), 1000); 

        alert('Registrado com sucesso!');
        renderAll();
        goToAportes();
    });
}

function openTransferModal(id) {
    const inv = investments.find(i => i.id === id);
    if(!inv) return;

    const amountStr = prompt(`Resgate: ${inv.name}\nValor Atual: ${formatCurrency(inv.value)}\nQuanto resgatar?`);
    if(!amountStr) return;
    const amount = parseFloat(amountStr.replace(',', '.'));
    
    if(isNaN(amount) || amount <= 0 || amount > inv.value) { alert("Inválido."); return; }

    const action = prompt(`DESTINO:\n1 - Giro (Reinvestir)\n2 - Pessoal (Sacar)\nOpção:`);
    let targetWallet = action === '1' ? 'reinvest' : (action === '2' ? 'personal' : null);
    
    if(!targetWallet) return;

    inv.value -= amount;
    if(inv.value <= 0.01) inv.status = "Finalizado";

    const incomeTrans = {
        dataType: 'transaction',
        id: Date.now(),
        date: new Date().toLocaleDateString('pt-BR'),
        type: 'deposit',
        wallet: targetWallet,
        desc: `Resgate: ${inv.name}`,
        value: amount
    };

    transactions.unshift(incomeTrans);
    recalculateBalances();
    saveLocal();
    renderAll();
    sendToSheet(incomeTrans); 
    alert("Resgate realizado! (O saldo do ativo será atualizado na planilha na próxima recarga completa).");
}

function deleteTransaction(id) {
    if(!confirm("Apagar localmente? (Se estiver na planilha, voltará ao recarregar a página).")) return;
    transactions = transactions.filter(t => t.id !== id);
    recalculateBalances();
    saveLocal();
    renderAll();
}

function deleteInvestment(id) {
    if(!confirm("Apagar localmente?")) return;
    investments = investments.filter(i => i.id !== id);
    saveLocal();
    renderAll();
}

// --- COMUNICAÇÃO COM API (AJAX) ---
function sendToSheet(dataObj) {
    if (!GOOGLE_SHEET_URL || GOOGLE_SHEET_URL.includes("COLE_SUA")) return;

    fetch(GOOGLE_SHEET_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataObj)
    }).then(() => console.log("Dados enviados para nuvem."));
}

function loadFromSheet() {
    if (!GOOGLE_SHEET_URL || GOOGLE_SHEET_URL.includes("COLE_SUA")) return;
    
    const tableBody = document.getElementById('investTableBody');
    if(tableBody) tableBody.style.opacity = '0.5';

    fetch(GOOGLE_SHEET_URL)
    .then(res => res.json())
    .then(data => {
        if(data.investments && data.transactions) {
            investments = data.investments;
            transactions = data.transactions;
            recalculateBalances();
            saveLocal();
            renderAll();
            // Se estiver na tela de evolução, atualiza o gráfico com os dados novos
            if(document.getElementById('evolucao').classList.contains('active-section')) {
                updateEvolutionChart();
            }
        }
    })
    .catch(err => console.error("Erro sync:", err))
    .finally(() => { if(tableBody) tableBody.style.opacity = '1'; });
}

// --- UTILITÁRIOS ---
function saveLocal() {
    localStorage.setItem('investments', JSON.stringify(investments));
    localStorage.setItem('transactions', JSON.stringify(transactions));
}

function formatCurrency(val) {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function renderAll() {
    renderWallets();
    renderInvestments();
    updateDashboard();
    // A evolução é pesada para renderizar sempre, então só chamamos se a aba estiver ativa
    if(document.getElementById('evolucao').classList.contains('active-section')) {
        updateEvolutionChart();
    }
}

// --- RENDERIZAÇÃO (UI) ---
function renderWallets() {
    document.getElementById('balanceReinvest').innerText = formatCurrency(balanceReinvest);
    document.getElementById('dashBalanceReinvest').innerText = formatCurrency(balanceReinvest);
    document.getElementById('balancePersonal').innerText = formatCurrency(balancePersonal);
    document.getElementById('dashBalancePersonal').innerText = formatCurrency(balancePersonal);

    const tbodyGiro = document.getElementById('tableBodyReinvest');
    const tbodyPersonal = document.getElementById('tableBodyPersonal');
    if(tbodyGiro) tbodyGiro.innerHTML = ''; 
    if(tbodyPersonal) tbodyPersonal.innerHTML = '';

    transactions.forEach(t => {
        const isGiro = t.wallet === 'reinvest';
        const colorClass = t.type === 'deposit' ? 'text-green' : 'text-red';
        const sign = t.type === 'deposit' ? '+' : '-';
        
        const html = `
            <tr>
                <td>${t.date}</td>
                <td class="${colorClass}">${t.type === 'deposit' ? 'Entrada' : 'Saída'}</td>
                <td>${t.desc}</td>
                <td>${sign} ${formatCurrency(t.value)}</td>
                <td><button class="btn-icon delete" onclick="deleteTransaction(${t.id})"><span class="material-icons-outlined">delete</span></button></td>
            </tr>`;
        
        if(isGiro && tbodyGiro) tbodyGiro.innerHTML += html;
        else if(!isGiro && tbodyPersonal) tbodyPersonal.innerHTML += html;
    });
}

function renderInvestments() {
    const tbody = document.getElementById('investTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    investments.forEach(inv => {
        // Correção de data caso venha ISO da planilha ou YYYY-MM-DD
        let dateFmt = inv.date;
        if(inv.date && inv.date.includes('-') && inv.date.length === 10) {
            const parts = inv.date.split('-');
            dateFmt = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        
        let expiryFmt = '-';
        if(inv.expiry && inv.expiry.includes('-') && inv.expiry.length === 10) {
             const parts = inv.expiry.split('-');
             expiryFmt = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }

        tbody.innerHTML += `
            <tr>
                <td><strong>${inv.name}</strong><br><small style="color:#aaa">${inv.type}</small></td>
                <td>${dateFmt}</td>
                <td>${expiryFmt}</td>
                <td>${formatCurrency(inv.value)}</td>
                <td>${inv.ratePrev ? inv.ratePrev + ' ' + inv.rateTypePrev : '-'}</td>
                <td><span style="font-size:0.8rem; padding:2px 6px; border-radius:4px; background:${inv.status === 'Ativo' ? 'rgba(9,132,227,0.2)' : 'rgba(0,184,148,0.2)'}; color:${inv.status === 'Ativo' ? 'var(--accent-blue)' : 'var(--accent-green)'}">${inv.status}</span></td>
                <td>
                    <button class="btn-icon transfer" onclick="openTransferModal(${inv.id})"><span class="material-icons-outlined">swap_horiz</span></button>
                    <button class="btn-icon delete" onclick="deleteInvestment(${inv.id})"><span class="material-icons-outlined">delete</span></button>
                </td>
            </tr>`;
    });
}

function updateDashboard() {
    const totalInvested = investments.reduce((acc, curr) => acc + curr.value, 0);
    document.getElementById('dashTotalInvested').innerText = formatCurrency(totalInvested);

    const activeInv = investments.filter(i => i.status === 'Ativo' && i.expiry);
    activeInv.sort((a,b) => new Date(a.expiry) - new Date(b.expiry));
    
    if(activeInv.length > 0) {
        const next = activeInv[0];
        // Tratamento seguro de data
        let displayDate = next.expiry;
        if(next.expiry && next.expiry.includes('-')) {
             const p = next.expiry.split('-');
             displayDate = `${p[2]}/${p[1]}`;
        }
        document.getElementById('dashNextExpiry').innerText = displayDate;
        document.getElementById('dashNextExpiryName').innerText = next.name;
    } else {
        document.getElementById('dashNextExpiry').innerText = '--/--';
        document.getElementById('dashNextExpiryName').innerText = 'Sem vencimentos';
    }
    updateCharts();
}

function updateCharts() {
    if(typeof Chart === 'undefined') return;

    const types = {};
    investments.forEach(inv => { types[inv.type] = (types[inv.type] || 0) + inv.value; });
    const insts = {};
    investments.forEach(inv => { insts[inv.institution] = (insts[inv.institution] || 0) + inv.value; });

    const ctxPie = document.getElementById('pieChart');
    const ctxBar = document.getElementById('barChart');
    if(!ctxPie || !ctxBar) return;

    if(pieChartInstance) pieChartInstance.destroy();
    pieChartInstance = new Chart(ctxPie.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(types).length ? Object.keys(types) : ['Vazio'],
            datasets: [{ data: Object.values(types).length ? Object.values(types) : [1], backgroundColor: ['#0984e3', '#00b894', '#6c5ce7', '#ff7675', '#fdcb6e'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#fff' } } } }
    });

    if(barChartInstance) barChartInstance.destroy();
    barChartInstance = new Chart(ctxBar.getContext('2d'), {
        type: 'bar',
        data: {
            labels: Object.keys(insts).length ? Object.keys(insts) : ['Vazio'],
            datasets: [{ label: 'Total', data: Object.values(insts).length ? Object.values(insts) : [0], backgroundColor: '#34495e', borderRadius: 4 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#fff' } } },
            scales: { y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { ticks: { color: '#94a3b8' }, grid: { display: false } } }
        }
    });
}

// --- LÓGICA DE EVOLUÇÃO (RESTAURADA) ---
function updateEvolutionChart() {
    const ctx = document.getElementById('evolutionChart');
    const tableBody = document.querySelector('#evolutionTable tbody');
    if(!ctx || !tableBody) return;
    
    tableBody.innerHTML = '';
    
    // 1. Pegar Filtros
    const typeFilter = document.getElementById('filterType').value;
    const instFilter = document.getElementById('filterInst').value;
    const statusFilter = document.getElementById('filterStatus').value;
    const periodFilter = document.getElementById('filterPeriod').value;

    // 2. Filtrar Investimentos
    const filteredInvestments = investments.filter(inv => {
        if (typeFilter !== 'all' && inv.type !== typeFilter) return false;
        if (instFilter !== 'all' && inv.institution !== instFilter) return false;
        if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
        return true;
    });

    // 3. Preparar Eixo de Tempo
    const labels = [];
    const dataPoints = [];
    let startDate = new Date();
    
    if (periodFilter === 'all') {
        if(filteredInvestments.length > 0) {
            // Encontra a data mais antiga com segurança
            const dates = filteredInvestments.map(i => {
                const p = i.date.split('-');
                return new Date(p[0], p[1]-1, p[2]).getTime();
            });
            const minDate = new Date(Math.min(...dates));
            startDate = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
        } else {
            startDate.setMonth(startDate.getMonth() - 12);
        }
    } else {
        startDate.setMonth(startDate.getMonth() - parseInt(periodFilter));
    }

    const monthsToProject = periodFilter === 'all' ? 24 : parseInt(periodFilter) + 6;
    let previousValue = 0;

    for (let i = 0; i < monthsToProject; i++) {
        const d = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
        const labelDate = `${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
        labels.push(labelDate);
        
        let totalValueInMonth = 0;

        filteredInvestments.forEach(inv => {
            // Conversão segura de data (YYYY-MM-DD para Date)
            const p = inv.date.split('-');
            const invStart = new Date(p[0], p[1]-1, p[2]);
            
            if (d >= invStart) {
                const diffTime = Math.abs(d - invStart);
                const diffMonths = diffTime / (1000 * 60 * 60 * 24 * 30.44); 
                
                let rateYearly = 0.10; // Default 10%
                if (inv.ratePrev) {
                    const rateVal = parseFloat(inv.ratePrev);
                    // Lógica de Taxas
                    if (inv.rateTypePrev && inv.rateTypePrev.includes('CDI')) {
                        rateYearly = (rateVal / 100) * 0.11; // CDI = 11%
                    } else if (inv.rateTypePrev && inv.rateTypePrev.includes('a.a.')) {
                        rateYearly = rateVal / 100;
                    } else if (inv.rateTypePrev && inv.rateTypePrev.includes('IPCA')) {
                        rateYearly = 0.05 + (rateVal / 100); // IPCA = 5% + taxa
                    }
                }

                const rateMonthly = Math.pow(1 + rateYearly, 1/12) - 1;
                const projectedVal = inv.value * Math.pow(1 + rateMonthly, diffMonths);
                
                // Se finalizado, não deveria projetar eternamente, mas para este visualizador simples, mantemos a curva
                totalValueInMonth += projectedVal;
            }
        });

        dataPoints.push(totalValueInMonth);

        // Preencher Tabela
        const growth = totalValueInMonth - previousValue;
        const growthStr = i === 0 ? '-' : (growth >= 0 ? '+' : '') + formatCurrency(growth);
        const styleGrowth = growth >= 0 ? 'color: var(--accent-green)' : 'color: var(--accent-red)';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${labelDate}</td>
            <td style="font-weight:bold;">${formatCurrency(totalValueInMonth)}</td>
            <td style="${styleGrowth}">${growthStr}</td>
        `;
        tableBody.appendChild(tr);

        previousValue = totalValueInMonth;
    }

    // Renderizar Gráfico
    if (evolutionChartInstance) evolutionChartInstance.destroy();

    evolutionChartInstance = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Evolução Patrimonial (Estimada)',
                data: dataPoints,
                borderColor: '#00b894',
                backgroundColor: 'rgba(0, 184, 148, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#fff' } },
                tooltip: { callbacks: { label: function(context) { return formatCurrency(context.raw); } } }
            },
            scales: {
                y: { ticks: { color: '#94a3b8', callback: (val) => 'R$ ' + val }, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { ticks: { color: '#94a3b8', maxTicksLimit: 10 }, grid: { display: false } }
            }
        }
    });
}

function clearAllData() {
    if(confirm("ATENÇÃO: Isso apagará TODOS os dados locais. Deseja continuar?")) {
        localStorage.clear();
        location.reload();
    }
}

