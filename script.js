// --- ESTADO DA APLICAÇÃO (DADOS) ---
let investments = JSON.parse(localStorage.getItem('investments')) || [];
let transactions = JSON.parse(localStorage.getItem('transactions')) || []; // Unificando transações

// Saldos separados
let balanceReinvest = parseFloat(localStorage.getItem('balanceReinvest')) || 0; // Giro
let balancePersonal = parseFloat(localStorage.getItem('balancePersonal')) || 0; // Pessoal

// --- CONFIGURAÇÃO GOOGLE SHEETS ---
// IMPORTANTE: Substitua o texto abaixo pelo link do seu App Script (mantenha as aspas)
const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbzW-kPYS2xDqSyEjE04iwL_FXR_ZaRqKeXdw5XadLH47QobjHHNbI-biORVsgNBHVaIxg/exec"; 

// Instâncias dos gráficos
let pieChartInstance = null;
let barChartInstance = null;
let evolutionChartInstance = null;

// --- NAVEGAÇÃO ---
function showPage(pageId, element) {
    document.querySelectorAll('.page-section').forEach(section => section.classList.remove('active-section'));
    if(element) {
        document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
        element.classList.add('active');
    }
    
    document.getElementById(pageId).classList.add('active-section');
    
    // Atualizações específicas
    if(pageId === 'dashboard') updateDashboard();
    if(pageId === 'evolucao') updateEvolutionChart();
}

function checkPasswordAndShowConfig(element) {
    const pwd = prompt("Digite a senha de administrador:");
    if(pwd === '2915') {
        showPage('config', element);
    } else {
        alert("Senha incorreta.");
    }
}

function goToAportes() {
    // Seleciona o item de menu correspondente (Aportes é o 5º item se contarmos categorias)
    const menuItems = document.querySelectorAll('.menu-item');
    if(menuItems[4]) showPage('aportes', menuItems[4]); 
}

// --- FUNÇÕES DA CARTEIRA (DEPÓSITO/SAQUE/MOVIMENTAÇÃO) ---
// walletType: 'reinvest' (Giro) ou 'personal' (Pessoal)
function handleTransaction(type, walletType) {
    const text = type === 'deposit' ? 'Depositar' : 'Sacar';
    const walletName = walletType === 'reinvest' ? 'Carteira de Giro' : 'Carteira Pessoal';
    
    const valueStr = prompt(`${text} em ${walletName}\nQual valor? (Ex: 1000.50)`);
    
    if (!valueStr) return;
    const value = parseFloat(valueStr.replace(',', '.'));
    
    if (isNaN(value) || value <= 0) {
        alert('Valor inválido!');
        return;
    }

    // Verifica saldo para saque
    if (type === 'withdraw') {
        const currentBalance = walletType === 'reinvest' ? balanceReinvest : balancePersonal;
        if (value > currentBalance) {
            alert('Saldo insuficiente nesta carteira!');
            return;
        }
    }

    // Atualiza Saldo
    if (walletType === 'reinvest') {
        if(type === 'deposit') balanceReinvest += value;
        else balanceReinvest -= value;
    } else {
        if(type === 'deposit') balancePersonal += value;
        else balancePersonal -= value;
    }

    // Registra Transação
    const transaction = {
        id: Date.now(),
        date: new Date().toLocaleDateString('pt-BR'),
        type: type, // 'deposit' ou 'withdraw'
        wallet: walletType, // 'reinvest' ou 'personal'
        desc: type === 'deposit' ? 'Aporte Manual' : 'Retirada Manual',
        value: value
    };

    transactions.unshift(transaction);
    saveData();
    renderWallets();
    updateDashboard();
}

function deleteTransaction(id) {
    if(!confirm("Apagar este registro? O saldo será revertido.")) return;

    const index = transactions.findIndex(t => t.id === id);
    if (index > -1) {
        const t = transactions[index];
        
        // Reverte o saldo
        if (t.wallet === 'reinvest') {
            if (t.type === 'deposit') balanceReinvest -= t.value;
            else balanceReinvest += t.value;
        } else {
            if (t.type === 'deposit') balancePersonal -= t.value;
            else balancePersonal += t.value;
        }

        transactions.splice(index, 1);
        saveData();
        renderWallets();
        updateDashboard();
    }
}

// --- FUNÇÕES DE INVESTIMENTO (CRUD) ---
const form = document.getElementById('investForm');
if(form) {
    form.addEventListener('submit', function(e) {
        e.preventDefault();

        const value = parseFloat(document.getElementById('inpValue').value);
        
        // LÓGICA DE DÉBITO AUTOMÁTICO DO GIRO
        if (value > balanceReinvest) {
            alert(`Saldo insuficiente na Carteira de Giro (Disponível: ${formatCurrency(balanceReinvest)}). Faça um depósito no Giro primeiro.`);
            return;
        }

        const newInvest = {
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

        // --- INTEGRAÇÃO GOOGLE SHEETS (POST) ---
        if (GOOGLE_SHEET_URL && GOOGLE_SHEET_URL !== "COLE_SUA_URL_AQUI") {
            const btnSubmit = document.querySelector('#investForm button[type="submit"]');
            const originalText = btnSubmit.innerText;
            btnSubmit.innerText = "Salvando na Nuvem...";
            btnSubmit.disabled = true;
            btnSubmit.style.opacity = "0.7";

            fetch(GOOGLE_SHEET_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newInvest)
            })
            .then(() => {
                console.log("Enviado para planilha!");
            })
            .catch(err => {
                console.error("Erro ao enviar para planilha", err);
                alert('Aviso: Salvo localmente, mas houve erro ao enviar para a planilha.');
            })
            .finally(() => {
                btnSubmit.innerText = originalText;
                btnSubmit.disabled = false;
                btnSubmit.style.opacity = "1";
            });
        }

        // Debita do Giro e registra transação de saída
        balanceReinvest -= value;
        transactions.unshift({
            id: Date.now(),
            date: new Date().toLocaleDateString('pt-BR'),
            type: 'withdraw',
            wallet: 'reinvest',
            desc: `Investimento em: ${newInvest.name}`,
            value: value
        });

        investments.push(newInvest);
        document.getElementById('investForm').reset();
        
        saveData();
        // Pequeno delay para dar a sensação de processamento
        setTimeout(() => {
            alert('Investimento registrado com sucesso!');
            renderInvestments();
            renderWallets();
            goToAportes();
        }, 500);
    });
}

function deleteInvestment(id) {
    if(!confirm("Tem certeza que deseja apagar este investimento? (O valor NÃO será estornado automaticamente, use a função Resgatar para isso).")) return;
    
    investments = investments.filter(inv => inv.id !== id);
    saveData();
    renderInvestments();
    updateDashboard();
}

// --- FUNÇÃO DE SINCRONIZAÇÃO (GET) ---
function loadFromSheet() {
    // Só executa se tiver URL configurada
    if (!GOOGLE_SHEET_URL || GOOGLE_SHEET_URL === "COLE_SUA_URL_AQUI") return;

    console.log("Iniciando sincronização com planilha...");
    const tableContainer = document.querySelector('#investTableBody') ? document.querySelector('#investTableBody').parentElement : null;
    if(tableContainer) tableContainer.style.opacity = '0.5';

    fetch(GOOGLE_SHEET_URL)
    .then(response => response.json())
    .then(data => {
        if(Array.isArray(data) && data.length > 0) {
            console.log("Dados recebidos da nuvem:", data.length);
            
            // Atualiza a memória local com o que veio da planilha (Fonte da Verdade)
            investments = data;
            
            // Salva e atualiza a tela
            saveData();
            renderInvestments();
            updateDashboard();
            
            // Feedback discreto no console (para não incomodar com alert toda vez que abre)
            console.log("Sincronização concluída com sucesso.");
        }
    })
    .catch(error => {
        console.error("Erro ao sincronizar com planilha:", error);
    })
    .finally(() => {
        if(tableContainer) tableContainer.style.opacity = '1';
    });
}


// --- LÓGICA DE TRANSFERÊNCIA / RESGATE INTELIGENTE ---
function openTransferModal(id) {
    const inv = investments.find(i => i.id === id);
    if(!inv) return;

    const amountStr = prompt(`Resgate de Ativo: ${inv.name}\nValor Atual (Base): ${formatCurrency(inv.value)}\n\nQuanto deseja resgatar?`);
    if(!amountStr) return;

    const amount = parseFloat(amountStr.replace(',', '.'));
    if(isNaN(amount) || amount <= 0 || amount > inv.value) {
        alert("Valor inválido ou insuficiente.");
        return;
    }

    // AQUI ESTÁ A LÓGICA DE DECISÃO DE CARTEIRA
    const action = prompt(`DESTINO DO RESGATE (${formatCurrency(amount)}):\n\n1 - Carteira de GIRO (Para reinvestir)\n2 - Carteira PESSOAL (Para sacar/gastar)\n\nDigite o número da opção:`);

    let targetWallet = '';
    let desc = '';

    if(action === '1') {
        targetWallet = 'reinvest';
        balanceReinvest += amount;
        desc = `Resgate (Giro): ${inv.name}`;
    } else if (action === '2') {
        targetWallet = 'personal';
        balancePersonal += amount;
        desc = `Resgate (Pessoal): ${inv.name}`;
    } else {
        alert("Operação cancelada.");
        return;
    }

    // Atualiza investimento
    inv.value -= amount;
    if(inv.value <= 0.01) inv.status = "Finalizado";
    
    // Cria transação de entrada na carteira escolhida
    transactions.unshift({
        id: Date.now(),
        date: new Date().toLocaleDateString('pt-BR'),
        type: 'deposit',
        wallet: targetWallet,
        desc: desc,
        value: amount
    });
    
    saveData();
    renderInvestments();
    renderWallets();
    updateDashboard();
    alert("Resgate realizado com sucesso!");
}

// --- LÓGICA DO GRÁFICO E TABELA DE EVOLUÇÃO ---
function updateEvolutionChart() {
    const ctx = document.getElementById('evolutionChart').getContext('2d');
    const tableBody = document.querySelector('#evolutionTable tbody');
    tableBody.innerHTML = ''; // Limpa tabela
    
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
                const minDate = new Date(Math.min(...filteredInvestments.map(i => new Date(i.date))));
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
            const invStart = new Date(inv.date);
            
            if (d >= invStart) {
                const diffTime = Math.abs(d - invStart);
                const diffMonths = diffTime / (1000 * 60 * 60 * 24 * 30.44); 
                
                let rateYearly = 0.10; // Default
                if (inv.ratePrev) {
                    const rateVal = parseFloat(inv.ratePrev);
                    if (inv.rateTypePrev === '% CDI') {
                        rateYearly = (rateVal / 100) * 0.11; // CDI = 11%
                    } else if (inv.rateTypePrev === '% a.a.') {
                        rateYearly = rateVal / 100;
                    } else {
                        rateYearly = 0.05 + (rateVal / 100); // IPCA = 5% + taxa
                    }
                }

                const rateMonthly = Math.pow(1 + rateYearly, 1/12) - 1;
                const projectedVal = inv.value * Math.pow(1 + rateMonthly, diffMonths);
                
                totalValueInMonth += projectedVal;
            }
        });

        dataPoints.push(totalValueInMonth);

        // PREENCHER A TABELA (LÓGICA NOVA)
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

    evolutionChartInstance = new Chart(ctx, {
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


// --- PERSISTÊNCIA E RENDERIZAÇÃO ---
function saveData() {
    localStorage.setItem('investments', JSON.stringify(investments));
    localStorage.setItem('transactions', JSON.stringify(transactions));
    localStorage.setItem('balanceReinvest', balanceReinvest.toString());
    localStorage.setItem('balancePersonal', balancePersonal.toString());
    updateDashboard(); 
}

function clearAllData() {
    if(confirm("ATENÇÃO: Isso apagará TODOS os dados. Deseja continuar?")) {
        localStorage.clear();
        location.reload();
    }
}

function formatCurrency(val) {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function renderWallets() {
    // Render Giro
    const tbodyGiro = document.getElementById('tableBodyReinvest');
    document.getElementById('balanceReinvest').innerText = formatCurrency(balanceReinvest);
    document.getElementById('dashBalanceReinvest').innerText = formatCurrency(balanceReinvest);
    
    tbodyGiro.innerHTML = '';
    const giroTrans = transactions.filter(t => t.wallet === 'reinvest');
    
    giroTrans.forEach(t => {
        const colorClass = t.type === 'deposit' ? 'text-green' : 'text-red';
        const sign = t.type === 'deposit' ? '+' : '-';
        tbodyGiro.innerHTML += `
            <tr>
                <td>${t.date}</td>
                <td class="${colorClass}">${t.type === 'deposit' ? 'Entrada' : 'Saída'}</td>
                <td>${t.desc}</td>
                <td>${sign} ${formatCurrency(t.value)}</td>
                <td><button class="btn-icon delete" onclick="deleteTransaction(${t.id})"><span class="material-icons-outlined">delete</span></button></td>
            </tr>`;
    });

    // Render Pessoal
    const tbodyPersonal = document.getElementById('tableBodyPersonal');
    document.getElementById('balancePersonal').innerText = formatCurrency(balancePersonal);
    document.getElementById('dashBalancePersonal').innerText = formatCurrency(balancePersonal);

    tbodyPersonal.innerHTML = '';
    const personalTrans = transactions.filter(t => t.wallet === 'personal');
    
    personalTrans.forEach(t => {
        const colorClass = t.type === 'deposit' ? 'text-green' : 'text-red';
        const sign = t.type === 'deposit' ? '+' : '-';
        tbodyPersonal.innerHTML += `
            <tr>
                <td>${t.date}</td>
                <td class="${colorClass}">${t.type === 'deposit' ? 'Entrada' : 'Saída'}</td>
                <td>${t.desc}</td>
                <td>${sign} ${formatCurrency(t.value)}</td>
                <td><button class="btn-icon delete" onclick="deleteTransaction(${t.id})"><span class="material-icons-outlined">delete</span></button></td>
            </tr>`;
    });
}

function renderInvestments() {
    const tbody = document.getElementById('investTableBody');
    tbody.innerHTML = '';

    investments.forEach(inv => {
        const tr = document.createElement('tr');
        const dateParts = inv.date.split('-');
        const dateFmt = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        
        let expiryFmt = '-';
        if(inv.expiry) {
                const expParts = inv.expiry.split('-');
                expiryFmt = `${expParts[2]}/${expParts[1]}/${expParts[0]}`;
        }

        tr.innerHTML = `
            <td><strong>${inv.name}</strong><br><small style="color:#aaa">${inv.type}</small></td>
            <td>${dateFmt}</td>
            <td>${expiryFmt}</td>
            <td>${formatCurrency(inv.value)}</td>
            <td>${inv.ratePrev ? inv.ratePrev + ' ' + inv.rateTypePrev : '-'}</td>
            <td><span style="font-size:0.8rem; padding:2px 6px; border-radius:4px; background:${inv.status === 'Ativo' ? 'rgba(9,132,227,0.2)' : 'rgba(0,184,148,0.2)'}; color:${inv.status === 'Ativo' ? 'var(--accent-blue)' : 'var(--accent-green)'}">${inv.status}</span></td>
            <td>
                <button class="btn-icon transfer" title="Resgatar / Reinvestir" onclick="openTransferModal(${inv.id})"><span class="material-icons-outlined">swap_horiz</span></button>
                <button class="btn-icon delete" title="Apagar" onclick="deleteInvestment(${inv.id})"><span class="material-icons-outlined">delete</span></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateDashboard() {
    const totalInvested = investments.reduce((acc, curr) => acc + curr.value, 0);
    document.getElementById('dashTotalInvested').innerText = formatCurrency(totalInvested);

    // Próximo vencimento
    const activeInv = investments.filter(i => i.status === 'Ativo' && i.expiry);
    activeInv.sort((a,b) => new Date(a.expiry) - new Date(b.expiry));
    
    if(activeInv.length > 0) {
        const next = activeInv[0];
        const expParts = next.expiry.split('-');
        document.getElementById('dashNextExpiry').innerText = `${expParts[2]}/${expParts[1]}`;
        document.getElementById('dashNextExpiryName').innerText = next.name;
    } else {
        document.getElementById('dashNextExpiry').innerText = '--/--';
        document.getElementById('dashNextExpiryName').innerText = 'Sem vencimentos';
    }

    updateCharts();
}

function updateCharts() {
    // Gráficos básicos
    const types = {};
    investments.forEach(inv => { types[inv.type] = (types[inv.type] || 0) + inv.value; });
    const insts = {};
    investments.forEach(inv => { insts[inv.institution] = (insts[inv.institution] || 0) + inv.value; });

    const ctxPie = document.getElementById('pieChart').getContext('2d');
    if(pieChartInstance) pieChartInstance.destroy();
    pieChartInstance = new Chart(ctxPie, {
        type: 'doughnut',
        data: {
            labels: Object.keys(types).length ? Object.keys(types) : ['Sem dados'],
            datasets: [{ data: Object.values(types).length ? Object.values(types) : [1], backgroundColor: ['#0984e3', '#00b894', '#6c5ce7', '#ff7675', '#fdcb6e'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#fff' } } } }
    });

    const ctxBar = document.getElementById('barChart').getContext('2d');
    if(barChartInstance) barChartInstance.destroy();
    barChartInstance = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: Object.keys(insts).length ? Object.keys(insts) : ['Sem dados'],
            datasets: [{ label: 'Total Investido', data: Object.values(insts).length ? Object.values(insts) : [0], backgroundColor: '#34495e', borderRadius: 4 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#fff' } } },
            scales: { y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { ticks: { color: '#94a3b8' }, grid: { display: false } } }
        }
    });
}

// --- INICIALIZAÇÃO ---
window.onload = function() {
    renderWallets();
    renderInvestments();
    updateDashboard();
    loadFromSheet(); // Busca dados ao abrir o site
};
