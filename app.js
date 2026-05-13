document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('simulatorForm');
    let simulationChart = null;

    // Helper function for normal distribution (Box-Muller)
    function randn_bm() {
        let u = 0, v = 0;
        while(u === 0) u = Math.random();
        while(v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    // Format currency
    const formatCurrency = (val) => {
        return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(val);
    };
    
    const formatPercent = (val) => {
        return (val * 100).toFixed(2) + '%';
    };

    function runSimulation(e) {
        if(e) e.preventDefault();

        // Get Inputs
        const initialPortfolio = parseFloat(document.getElementById('initialPortfolio').value);
        const initialWithdrawalRate = parseFloat(document.getElementById('initialWithdrawalRate').value) / 100;
        const years = parseInt(document.getElementById('simulationYears').value);
        const expectedReturn = parseFloat(document.getElementById('expectedReturn').value) / 100;
        const volatility = parseFloat(document.getElementById('returnVolatility').value) / 100;
        const inflationRate = parseFloat(document.getElementById('inflationRate').value) / 100;

        const useInflationRule = document.getElementById('useInflationRule').checked;
        const useCapitalRule = document.getElementById('useCapitalRule').checked;
        const useProsperityRule = document.getElementById('useProsperityRule').checked;

        // Initialize State
        let portfolio = initialPortfolio;
        let baseWithdrawal = initialPortfolio * initialWithdrawalRate;
        let actualWithdrawal = baseWithdrawal;
        let prevPortfolioReturn = 0; // First year has no previous return

        const results = [];
        let totalWithdrawal = 0;
        let guardrailUp = 0;
        let guardrailDown = 0;
        let bankruptYear = null;

        for (let year = 1; year <= years; year++) {
            if (portfolio <= 0) {
                if(!bankruptYear) bankruptYear = year - 1;
                portfolio = 0;
                results.push({ year, startPortfolio: 0, returnRate: 0, withdrawal: 0, actualRate: 0, endPortfolio: 0, action: '破產' });
                continue;
            }

            const startPortfolio = portfolio;
            
            // 1. Generate this year's market return
            const marketReturn = volatility > 0 ? expectedReturn + randn_bm() * volatility : expectedReturn;

            // 2. Apply GK Rules to determine withdrawal amount
            let currentWithdrawal = actualWithdrawal;
            let action = "-";

            if (year > 1) {
                // Apply inflation
                let applyInflation = true;
                if (useInflationRule && prevPortfolioReturn < 0) {
                    applyInflation = false; // Freeze inflation adjustment
                    action = "通膨凍結";
                }

                if (applyInflation) {
                    currentWithdrawal = currentWithdrawal * (1 + inflationRate);
                }

                // Check Guardrails based on current theoretical rate
                const currentRate = currentWithdrawal / startPortfolio;

                if (useCapitalRule && currentRate > initialWithdrawalRate * 1.2) {
                    currentWithdrawal = currentWithdrawal * 0.9; // 10% pay cut
                    action = "保本減薪(-10%)";
                    guardrailDown++;
                } else if (useProsperityRule && currentRate < initialWithdrawalRate * 0.8) {
                    currentWithdrawal = currentWithdrawal * 1.1; // 10% pay raise
                    action = "繁榮加薪(+10%)";
                    guardrailUp++;
                }
            }

            // Ensure we don't withdraw more than what's left
            if (currentWithdrawal > portfolio) {
                currentWithdrawal = portfolio;
            }

            actualWithdrawal = currentWithdrawal; // Save for next year
            totalWithdrawal += currentWithdrawal;

            // 3. Process withdrawal and market return
            // Standard approach: withdraw at beginning of year, remaining grows
            portfolio = portfolio - currentWithdrawal;
            
            if (portfolio > 0) {
                portfolio = portfolio * (1 + marketReturn);
            }

            const actualRate = startPortfolio > 0 ? currentWithdrawal / startPortfolio : 0;

            results.push({
                year,
                startPortfolio,
                returnRate: marketReturn,
                withdrawal: currentWithdrawal,
                actualRate: actualRate,
                endPortfolio: portfolio,
                action: action
            });

            prevPortfolioReturn = marketReturn;
        }

        updateDashboard(results, bankruptYear, totalWithdrawal, guardrailUp, guardrailDown);
        renderChart(results);
        renderTable(results);
    }

    function updateDashboard(results, bankruptYear, totalWithdrawal, guardrailUp, guardrailDown) {
        const finalObj = results[results.length - 1];
        document.getElementById('finalPortfolioValue').textContent = formatCurrency(finalObj.endPortfolio);
        
        const statusEl = document.getElementById('survivalStatus');
        if (bankruptYear) {
            statusEl.innerHTML = `<span class="text-danger">第 ${bankruptYear} 年破產</span>`;
        } else {
            statusEl.innerHTML = `<span class="text-success">安全度過 ${results.length} 年</span>`;
        }

        document.getElementById('totalWithdrawalValue').textContent = formatCurrency(totalWithdrawal);
        document.getElementById('guardrailTriggers').innerHTML = `<span class="text-success">+${guardrailUp}</span> / <span class="text-danger">-${guardrailDown}</span>`;
    }

    function renderTable(results) {
        const tbody = document.querySelector('#resultsTable tbody');
        tbody.innerHTML = '';

        results.forEach(r => {
            const tr = document.createElement('tr');
            
            let returnClass = '';
            if(r.returnRate > 0) returnClass = 'text-success';
            if(r.returnRate < 0) returnClass = 'text-danger';

            let actionClass = '';
            if(r.action.includes('加薪')) actionClass = 'text-success';
            if(r.action.includes('減薪') || r.action.includes('凍結')) actionClass = 'text-warning';

            tr.innerHTML = `
                <td>${r.year}</td>
                <td>${formatCurrency(r.startPortfolio)}</td>
                <td class="${returnClass}">${formatPercent(r.returnRate)}</td>
                <td>${formatCurrency(r.withdrawal)}</td>
                <td>${formatPercent(r.actualRate)}</td>
                <td>${formatCurrency(r.endPortfolio)}</td>
                <td class="${actionClass}">${r.action}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function renderChart(results) {
        const ctx = document.getElementById('simulationChart').getContext('2d');
        
        if (simulationChart) {
            simulationChart.destroy();
        }

        const labels = results.map(r => `第 ${r.year} 年`);
        const portfolioData = results.map(r => r.endPortfolio);
        const withdrawalData = results.map(r => r.withdrawal);

        Chart.defaults.color = '#94a3b8';
        Chart.defaults.font.family = "'Noto Sans TC', sans-serif";

        simulationChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '期末資產價值',
                        data: portfolioData,
                        borderColor: '#6366f1',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        borderWidth: 2,
                        tension: 0.3,
                        yAxisID: 'y',
                        fill: true
                    },
                    {
                        label: '提領金額',
                        data: withdrawalData,
                        type: 'bar',
                        backgroundColor: 'rgba(236, 72, 153, 0.5)',
                        borderColor: 'rgba(236, 72, 153, 1)',
                        borderWidth: 1,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: '資產價值 (TWD)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: '提領金額 (TWD)'
                        },
                        grid: {
                            drawOnChartArea: false, 
                        },
                    },
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        }
                    }
                }
            }
        });
    }

    form.addEventListener('submit', runSimulation);

    // Initial run
    runSimulation();
});
