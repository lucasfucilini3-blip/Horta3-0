import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Sale, Transaction, Production, Customer } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell, PieChart, Pie, Legend } from 'recharts';
import { format, subDays, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart3, TrendingUp, TrendingDown, DollarSign, ShoppingBag, PieChart as PieChartIcon, Activity, Filter, Calendar, Search, Printer, User, Package, Sprout, Clock, Target, ClipboardList } from 'lucide-react';
import { useAuth, handleFirestoreError, OperationType, cn } from '../App';

export default function Reports() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [productions, setProductions] = useState<Production[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeReport, setActiveReport] = useState<'general' | 'operational' | 'customer' | 'product' | 'pending_deliveries' | 'receivables'>('general');

  // Filters for detailed report
  const [dateStart, setDateStart] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [dateEnd, setDateEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [filterCulture, setFilterCulture] = useState('all');
  const [filterBed, setFilterBed] = useState('all');
  const [useLogScale, setUseLogScale] = useState(false);

  // Filters for Pending Deliveries report
  const [deliveryFilterPreset, setDeliveryFilterPreset] = useState<'all' | 'today' | 'tomorrow' | 'next7' | 'custom'>('all');
  const [deliveryDateStart, setDeliveryDateStart] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [deliveryDateEnd, setDeliveryDateEnd] = useState(format(subDays(new Date(), -7), 'yyyy-MM-dd'));

  // Safe Firebase date parser
  const parseFirebaseDate = (val: any): Date | null => {
    if (!val) return null;
    let d: Date;
    if (val instanceof Date) {
      d = val;
    } else if (typeof val.toDate === 'function') {
      try {
        d = val.toDate();
      } catch (e) {
        return null;
      }
    } else if (typeof val.seconds === 'number') {
      d = new Date(val.seconds * 1000);
    } else if (typeof val._seconds === 'number') {
      d = new Date(val._seconds * 1000);
    } else {
      d = new Date(val);
    }

    if (isNaN(d.getTime())) return null;

    // Se a data estiver exatamente em UTC 00:00:00 (geralmente gerada por novos inputs de data sem horário de venda normal)
    // normalizamos para o meio-dia (12:00:00) local para evitar distorções de fuso horário que jogam a data pro dia anterior
    const utcHours = d.getUTCHours();
    const utcMinutes = d.getUTCMinutes();
    if (utcHours === 0 && utcMinutes === 0) {
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0);
    }

    return d;
  };

  const safeFormatDate = (val: any, formatStr: string = "dd/MM/yyyy") => {
    const d = parseFirebaseDate(val);
    if (!d) return 'Sem data';
    try {
      return format(d, formatStr, { locale: ptBR });
    } catch (e) {
      return 'Sem data';
    }
  };

  // Filter pending delivery sales based on selected date or preset
  const filteredPendingDeliveries = sales.filter((s) => {
    const isPending = s.status === 'ordered' || s.status === 'pending_delivery' || s.status === 'pending';
    if (!isPending) return false;

    // Garante que é uma entrega (tem flag isDelivery OU tem uma data de entrega definida OU tem endereço preenchido)
    const hasDeliveryIntent = s.isDelivery === true || !!s.deliveryDate || !!s.deliveryAddress?.trim();
    if (!hasDeliveryIntent) return false;

    if (deliveryFilterPreset === 'all') {
      return true;
    }

    const dDate = parseFirebaseDate(s.deliveryDate);
    if (!dDate) return false;

    const todayDate = new Date();

    if (deliveryFilterPreset === 'today') {
      const start = startOfDay(todayDate);
      const end = endOfDay(todayDate);
      return dDate >= start && dDate <= end;
    }
    if (deliveryFilterPreset === 'tomorrow') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const start = startOfDay(tomorrow);
      const end = endOfDay(tomorrow);
      return dDate >= start && dDate <= end;
    }
    if (deliveryFilterPreset === 'next7') {
      const start = startOfDay(todayDate);
      const endLimit = new Date();
      endLimit.setDate(endLimit.getDate() + 7);
      const end = endOfDay(endLimit);
      return dDate >= start && dDate <= end;
    }
    if (deliveryFilterPreset === 'custom') {
      if (deliveryDateStart) {
        const start = startOfDay(new Date(deliveryDateStart + 'T00:00:00'));
        if (dDate < start) return false;
      }
      if (deliveryDateEnd) {
        const end = endOfDay(new Date(deliveryDateEnd + 'T23:59:59'));
        if (dDate > end) return false;
      }
    }
    return true;
  });

  // Aggressive normalization helper
  const normalize = (str: string) => {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^a-z0-9]/g, ''); // Keep only letters and numbers
  };

  useEffect(() => {
    const salesQ = query(collection(db, 'sales'), orderBy('createdAt', 'desc'));
    const transQ = query(collection(db, 'transactions'), orderBy('date', 'desc'));
    const prodQ = query(collection(db, 'production'), orderBy('plantingDate', 'desc'));
    const custQ = query(collection(db, 'customers'), orderBy('companyName', 'asc'));

    const unsubSales = onSnapshot(salesQ, (snapshot) => {
      setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale)));
    });

    const unsubTrans = onSnapshot(transQ, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction)));
    });

    const unsubProd = onSnapshot(prodQ, (snapshot) => {
      setProductions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Production)));
      setLoading(false);
    });

    const unsubCust = onSnapshot(custQ, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
    });

    return () => { unsubSales(); unsubTrans(); unsubProd(); unsubCust(); };
  }, []);

  const getCustomerPhone = (sale: Sale) => {
    if (sale.customerPhone && sale.customerPhone.trim() !== '') {
      return sale.customerPhone;
    }
    const found = customers.find(c => 
      c.companyName?.trim().toLowerCase() === sale.customerName?.trim().toLowerCase()
    );
    return found?.phone || '';
  };

  // Prepare data for charts
  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const date = subDays(new Date(), i);
    const daySales = sales.filter(s => 
      (s.status === 'paid' || s.status === 'confirmed') && 
      s.confirmedAt?.toDate && 
      isWithinInterval(s.confirmedAt.toDate(), { start: startOfDay(date), end: endOfDay(date) })
    );
    return {
      name: format(date, 'dd/MM', { locale: ptBR }),
      total: daySales.reduce((acc, s) => acc + s.total, 0),
      count: daySales.length
    };
  }).reverse();

  const categoryData = transactions
    .filter(t => t.type === 'expense')
    .reduce((acc: any[], t) => {
      const existing = acc.find(a => a.name === t.category);
      if (existing) existing.value += t.amount;
      else acc.push({ name: t.category, value: t.amount });
      return acc;
    }, []);

  const COLORS = ['#2563eb', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#ec4899'];

  // Profitability per Culture
  const cultureProfitData = sales
    .filter(s => ['paid', 'confirmed', 'delivered'].includes(s.status))
    .reduce((acc: any[], s) => {
      s.items.forEach(item => {
        const normName = normalize(item.name);
        const existing = acc.find(a => normalize(a.name) === normName);
        const revenue = item.price * item.quantity;
        const cost = (item.cost || 0) * item.quantity;
        const profit = revenue - cost;
        
        if (existing) {
          existing.revenue += revenue;
          existing.cost += cost;
          existing.profit += profit;
        } else {
          acc.push({ name: item.name, revenue, cost, profit });
        }
      });
      return acc;
    }, [])
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10);

  // Profitability per Bed
  const bedProfitData = sales
    .filter(s => ['paid', 'confirmed', 'delivered'].includes(s.status))
    .reduce((acc: any[], s) => {
      s.items.forEach(item => {
        // Find production to get bed
        const prod = productions.find(p => p.id === (item.productionId || item.itemId));
        const bed = prod?.bed || 'Estoque/Outros';
        
        const existing = acc.find(a => a.name === bed);
        const revenue = item.price * item.quantity;
        const cost = (item.cost || 0) * item.quantity;
        const profit = revenue - cost;
        
        if (existing) {
          existing.revenue += revenue;
          existing.cost += cost;
          existing.profit += profit;
        } else {
          acc.push({ name: bed, revenue, cost, profit });
        }
      });
      return acc;
    }, [])
    .sort((a, b) => b.profit - a.profit);

  const totalRevenue = sales.filter(s => ['paid', 'confirmed', 'delivered'].includes(s.status)).reduce((acc, s) => acc + s.total, 0);
  const totalCOGS = sales.filter(s => ['paid', 'confirmed', 'delivered'].includes(s.status)).reduce((acc, s) => {
    return acc + s.items.reduce((sum, item) => sum + ((item.cost || 0) * item.quantity), 0);
  }, 0);
  const otherExpenses = transactions
    .filter(t => t.type === 'expense' && t.category !== 'Compra de Insumos')
    .reduce((acc, t) => acc + t.amount, 0);
  
  const netProfit = totalRevenue - totalCOGS - otherExpenses;

  // Detailed Cost Report Data
  const detailedReportData = productions
    .filter(p => {
      const pDate = p.plantingDate?.toDate ? p.plantingDate.toDate() : new Date(p.plantingDate);
      const isWithinDate = isWithinInterval(pDate, { 
        start: startOfDay(new Date(dateStart)), 
        end: endOfDay(new Date(dateEnd)) 
      });
      const matchesCulture = filterCulture === 'all' || p.crop === filterCulture;
      const matchesBed = filterBed === 'all' || p.bed === filterBed;
      return isWithinDate && matchesCulture && matchesBed;
    })
    .map(p => {
      const relatedSales = sales.filter(s => (s.status === 'paid' || s.status === 'confirmed') && s.items.some(i => i.productionId === p.id));
      const revenue = relatedSales.reduce((acc, s) => {
        const item = s.items.find(i => i.productionId === p.id);
        return acc + (item ? item.price * item.quantity : 0);
      }, 0);
      
      // Use the totalCost field from the production record
      const cost = p.totalCost || 0;

      return {
        ...p,
        revenue,
        cost,
        profit: revenue - cost
      };
    });

  const cultures = Array.from(new Set(productions.map(p => p.crop)));
  const beds = Array.from(new Set(productions.map(p => p.bed)));

  // Helper for aggressive normalization
  // (Using the one defined at the start of component)

  // Sales by Customer
  const salesByCustomer = sales
    .filter(s => ['paid', 'confirmed', 'delivered'].includes(s.status))
    .reduce((acc: any[], s) => {
      const existing = acc.find(a => a.customerName === s.customerName);
      if (existing) {
        existing.total += s.total;
        existing.count += 1;
      } else {
        acc.push({ customerName: s.customerName, total: s.total, count: 1 });
      }
      return acc;
    }, [])
    .sort((a, b) => b.total - a.total);

  // Sales by Product
  const salesByProduct = sales
    .filter(s => ['paid', 'confirmed', 'delivered'].includes(s.status))
    .reduce((acc: any[], s) => {
      s.items.forEach(item => {
        const normName = normalize(item.name);
        const existing = acc.find(a => normalize(a.name) === normName);
        if (existing) {
          existing.total += item.price * item.quantity;
          existing.quantity += item.quantity;
        } else {
          acc.push({ name: item.name, total: item.price * item.quantity, quantity: item.quantity });
        }
      });
      return acc;
    }, [])
    .sort((a, b) => b.total - a.total);

  // Average Prices with aggressive keys
  const averagePrices = salesByProduct.reduce((acc: any, p) => {
    acc[normalize(p.name)] = p.total / p.quantity;
    return acc;
  }, {});

  // Helper to find average price with fuzzy fallback
  const getAveragePrice = (cropName: string) => {
    if (!cropName) return 0;
    const normCrop = normalize(cropName);
    
    // 1. Exact normalized match (e.g., "Milho Verde" === "Milho Verde")
    if (averagePrices[normCrop]) return averagePrices[normCrop];

    const soldKeys = Object.keys(averagePrices);
    if (soldKeys.length === 0) return 0;

    // 2. Contains match (e.g., "Milho" in "Milho Verde")
    const includesMatch = soldKeys.find(sold => 
      sold.includes(normCrop) || normCrop.includes(sold)
    );
    if (includesMatch) return averagePrices[includesMatch];

    // 3. Keyword-based matching (The "Milho" case)
    // Extract significant words (length > 2) from the crop name
    const cropKeywords = cropName
      .split(/[\s-]+/)
      .map(w => normalize(w))
      .filter(w => w.length > 2);

    if (cropKeywords.length > 0) {
      // Find a sold product that contains at least one of the major keywords
      // We prioritize the first keyword as it's usually the most significant (e.g., "Milho")
      for (const keyword of cropKeywords) {
        const keywordMatch = soldKeys.find(sold => sold.includes(keyword));
        if (keywordMatch) return averagePrices[keywordMatch];
      }
    }
    
    return 0;
  };

  // Operational Data Calculations
  const operationalStats = productions
    .filter(p => p.status === 'growing')
    .reduce((acc: any, p) => {
      const avgPrice = getAveragePrice(p.crop);
      const forecastRevenue = p.quantityPlanted * avgPrice;
      
      const normCrop = normalize(p.crop);
      const existing = acc.find((a: any) => normalize(a.name) === normCrop);
      if (existing) {
        existing.quantity += p.quantityPlanted;
        existing.forecastRevenue += forecastRevenue;
        existing.batches += 1;
      } else {
        acc.push({ 
          name: p.crop, 
          quantity: p.quantityPlanted, 
          unit: p.unit, 
          forecastRevenue,
          batches: 1,
          hasPrice: avgPrice > 0
        });
      }
      return acc;
    }, [])
    .sort((a: any, b: any) => b.forecastRevenue - a.forecastRevenue);

  const upcomingHarvests = productions
    .filter(p => p.status === 'growing' && p.estimatedHarvestDate)
    .map(p => {
      const avgPrice = getAveragePrice(p.crop);
      return {
        ...p,
        forecastRevenue: p.quantityPlanted * avgPrice,
        hasPrice: avgPrice > 0,
        daysToHarvest: Math.ceil(((p.estimatedHarvestDate?.toDate ? p.estimatedHarvestDate.toDate() : new Date(p.estimatedHarvestDate)).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
      };
    })
    .sort((a, b) => a.daysToHarvest - b.daysToHarvest);

  const harvestComparisonData = productions
    .filter(p => p.status === 'harvested')
    .slice(0, 5)
    .map(p => {
      const avgPrice = getAveragePrice(p.crop);
      const forecast = p.quantityPlanted * avgPrice;
      const relatedSales = sales.filter(s => ['paid', 'confirmed', 'delivered'].includes(s.status) && s.items.some(i => i.productionId === p.id));
      const actual = relatedSales.reduce((acc, s) => {
        const item = s.items.find(i => i.productionId === p.id);
        return acc + (item ? item.price * item.quantity : 0);
      }, 0);
      
      return {
        name: `${p.crop} (${p.bed})`,
        previsto: forecast,
        real: actual
      };
    });

  // Timeframe-based Forecasts
  const forecastTimeframes = upcomingHarvests.reduce((acc, h) => {
    const revenue = h.forecastRevenue || 0;
    if (h.daysToHarvest <= 7) acc.week += revenue;
    if (h.daysToHarvest <= 30) acc.month += revenue;
    if (h.daysToHarvest <= 365) acc.year += revenue;
    acc.total += revenue;
    return acc;
  }, { week: 0, month: 0, year: 0, total: 0 });

  // Productivity Analysis (Yield per Plant)
  const continuousHarvestCrops = ['tomate', 'gilo', 'pimenta', 'melancia', 'tomatecereja', 'pimentao'];
  
  const productivityStats = productions
    .filter(p => {
      const isHarvested = p.status === 'harvested' || (p.harvestQuantity && p.harvestQuantity > 0);
      if (!isHarvested) return false;

      // Only show for continuous harvest crops
      const normCrop = normalize(p.crop);
      const isFlaggedContinuous = p.isContinuousHarvest === true;
      const isKnownContinuous = p.isContinuousHarvest === undefined && continuousHarvestCrops.some(c => normCrop.includes(c));
      
      return isFlaggedContinuous || isKnownContinuous;
    })
    .reduce((acc: any[], p) => {
      const normCrop = normalize(p.crop);
      const existing = acc.find(a => normalize(a.name) === normCrop);
      
      const yieldPerPlant = p.quantityPlanted > 0 ? (p.harvestQuantity || 0) / p.quantityPlanted : 0;
      
      if (existing) {
        existing.totalPlanted += p.quantityPlanted;
        existing.totalHarvested += (p.harvestQuantity || 0);
        existing.batches += 1;
        existing.yields.push(yieldPerPlant);
      } else {
        acc.push({
          name: p.crop,
          totalPlanted: p.quantityPlanted,
          totalHarvested: (p.harvestQuantity || 0),
          unit: p.unit,
          batches: 1,
          yields: [yieldPerPlant],
          isContinuous: true // Since we filtered for it
        });
      }
      return acc;
    }, [])
    .map(stat => ({
      ...stat,
      avgYield: stat.totalPlanted > 0 ? stat.totalHarvested / stat.totalPlanted : 0,
      peakYield: Math.max(...stat.yields)
    }))
    .sort((a, b) => b.avgYield - a.avgYield);

  const inputStats = productions
    .filter(p => p.status === 'growing')
    .reduce((acc: any[], p) => {
      // Find all handling logs that used products
      p.logs.forEach(log => {
        if (log.products) {
          log.products.forEach(item => {
            const existing = acc.find(a => a.name === item.name);
            if (existing) {
              existing.value += item.quantity;
            } else {
              acc.push({ name: item.name, value: item.quantity, unit: item.unit });
            }
          });
        }
      });
      return acc;
    }, [])
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return (
    <>
      {/* Visualização de Tela (Oculta na impressão para layout limpo) */}
      <div className="space-y-8 pb-12 print:hidden no-print bg-transparent">
      <header className="flex items-center justify-between print:hidden">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Relatórios e Custos</h2>
          <p className="text-slate-500 mt-1">Análise detalhada de custos e lucratividade da horta.</p>
        </div>
        <button 
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
        >
          <Printer size={20} />
          Imprimir PDF
        </button>
      </header>

      {/* Report Selector */}
      <div className="flex flex-wrap gap-4 print:hidden">
        {[
          { id: 'general', label: 'Visão Geral', icon: Activity },
          { id: 'operational', label: 'Operacional', icon: Target },
          { id: 'pending_deliveries', label: 'Entregas Pendentes', icon: ShoppingBag },
          { id: 'receivables', label: 'Valores a Receber', icon: DollarSign },
          { id: 'customer', label: 'Vendas por Cliente', icon: User },
          { id: 'product', label: 'Vendas por Produto', icon: Package },
        ].map((report) => (
          <button
            key={report.id}
            onClick={() => setActiveReport(report.id as any)}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all",
              activeReport === report.id 
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-100"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            )}
          >
            <report.icon size={18} />
            {report.label}
          </button>
        ))}
        
        <div className="flex-1" />
        
        <button
          onClick={() => setUseLogScale(!useLogScale)}
          className={cn(
            "flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all border",
            useLogScale 
              ? "bg-amber-50 border-amber-200 text-amber-700 shadow-lg shadow-amber-50" 
              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
          )}
          title="Use escala logarítmica para visualizar melhor cultivos com valores muito diferentes"
        >
          <TrendingUp size={18} className={useLogScale ? "text-amber-500" : "text-slate-400"} />
          <span className="hidden sm:inline">Escala Logarítmica</span>
          <span className="sm:hidden text-[10px]">LOG</span>
          <div className={cn(
            "w-8 h-4 rounded-full relative transition-colors ml-2",
            useLogScale ? "bg-amber-400" : "bg-slate-200"
          )}>
            <div className={cn(
              "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all shadow-sm",
              useLogScale ? "left-4.5" : "left-0.5"
            )} />
          </div>
        </button>
      </div>

      {activeReport === 'general' && (
        <>
          {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <TrendingUp size={20} />
            </div>
            <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Receita Total</span>
          </div>
          <p className="text-2xl font-black text-slate-900">R$ {totalRevenue.toFixed(2)}</p>
          <p className="text-xs text-slate-400 mt-1">Vendas confirmadas</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
              <TrendingDown size={20} />
            </div>
            <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Custo (CPV)</span>
          </div>
          <p className="text-2xl font-black text-slate-900">R$ {totalCOGS.toFixed(2)}</p>
          <p className="text-xs text-slate-400 mt-1">Custo dos produtos vendidos</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Activity size={20} />
            </div>
            <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Lucro Bruto</span>
          </div>
          <p className="text-2xl font-black text-emerald-600">R$ {(totalRevenue - totalCOGS).toFixed(2)}</p>
          <p className="text-xs text-slate-400 mt-1">Margem: {totalRevenue > 0 ? (((totalRevenue - totalCOGS) / totalRevenue) * 100).toFixed(1) : 0}%</p>
        </div>

        <div className="bg-slate-900 p-6 rounded-2xl text-white shadow-xl shadow-slate-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-slate-800 text-emerald-400 rounded-lg">
              <DollarSign size={20} />
            </div>
            <span className="text-sm font-bold opacity-70 uppercase tracking-wider">Lucro Líquido</span>
          </div>
          <p className="text-2xl font-black">R$ {netProfit.toFixed(2)}</p>
          <p className="text-xs opacity-50 mt-1">Após outras despesas</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Profitability per Culture */}
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <PieChartIcon className="text-emerald-600" size={20} />
              Lucro por Cultura (Top 10)
            </h3>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cultureProfitData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  type="number" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }} 
                  scale={useLogScale ? "log" : "auto"}
                  domain={useLogScale ? ['auto', 'auto'] : [0, 'auto']}
                  allowDataOverflow={true}
                />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} width={100} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend />
                <Bar dataKey="profit" name="Lucro" fill="#059669" radius={[0, 4, 4, 0]} />
                <Bar dataKey="cost" name="Custo" fill="#94a3b8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Profitability per Bed */}
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="text-blue-600" size={20} />
              Lucro por Canteiro
            </h3>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bedProfitData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  scale={useLogScale ? "log" : "auto"}
                  domain={useLogScale ? ['auto', 'auto'] : [0, 'auto']}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="profit" name="Lucro" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sales Chart */}
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="text-emerald-600" size={20} />
              Vendas nos Últimos 7 Dias
            </h3>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last7Days}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Bar dataKey="total" name="Total" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Expenses by Category */}
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <TrendingDown className="text-rose-600" size={20} />
              Despesas por Categoria
            </h3>
          </div>
          <div className="h-80 w-full flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="w-1/3 space-y-2">
              {categoryData.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-xs font-bold text-slate-600 truncate">{c.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Numerical Report */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Activity className="text-emerald-600" size={24} />
                Relatório de Custos Detalhado
              </h3>
              <p className="text-sm text-slate-500 mt-1">Análise numérica por cultura e canteiro.</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                <Calendar size={16} className="text-slate-400" />
                <input 
                  type="date" 
                  value={dateStart}
                  onChange={(e) => setDateStart(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none"
                />
                <span className="text-slate-300">|</span>
                <input 
                  type="date" 
                  value={dateEnd}
                  onChange={(e) => setDateEnd(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none"
                />
              </div>
              
              <select 
                value={filterCulture}
                onChange={(e) => setFilterCulture(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">Todas Culturas</option>
                {cultures.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              <select 
                value={filterBed}
                onChange={(e) => setFilterBed(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">Todos Canteiros</option>
                {beds.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Cultura / Canteiro</th>
                <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Data Plantio</th>
                <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Receita</th>
                <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Custo Estimado</th>
                <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Lucro</th>
                <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Margem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {detailedReportData.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-8 py-4">
                    <div className="font-bold text-slate-900">{p.crop}</div>
                    <div className="text-xs text-slate-400">Canteiro: {p.bed}</div>
                  </td>
                  <td className="px-8 py-4 text-sm text-slate-600">
                    {p.plantingDate?.toDate ? format(p.plantingDate.toDate(), "dd/MM/yyyy") : format(new Date(p.plantingDate), "dd/MM/yyyy")}
                  </td>
                  <td className="px-8 py-4">
                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${
                      p.status === 'growing' ? 'bg-emerald-50 text-emerald-600' :
                      p.status === 'harvested' ? 'bg-blue-50 text-blue-600' :
                      'bg-rose-50 text-rose-600'
                    }`}>
                      {p.status === 'growing' ? 'Crescendo' : p.status === 'harvested' ? 'Colhido' : 'Perdido'}
                    </span>
                  </td>
                  <td className="px-8 py-4 text-sm font-bold text-slate-900 text-right">
                    R$ {p.revenue.toFixed(2)}
                  </td>
                  <td className="px-8 py-4 text-sm font-bold text-rose-600 text-right">
                    R$ {p.cost.toFixed(2)}
                  </td>
                  <td className={`px-8 py-4 text-sm font-bold text-right ${p.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    R$ {p.profit.toFixed(2)}
                  </td>
                  <td className="px-8 py-4 text-sm font-bold text-slate-900 text-right">
                    {p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              ))}
              {detailedReportData.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-8 py-12 text-center text-slate-400 italic">
                    Nenhum dado encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-slate-900 text-white">
              <tr>
                <td colSpan={3} className="px-8 py-4 font-bold uppercase tracking-wider text-xs">Totais do Período</td>
                <td className="px-8 py-4 text-sm font-black text-right">
                  R$ {detailedReportData.reduce((acc, p) => acc + p.revenue, 0).toFixed(2)}
                </td>
                <td className="px-8 py-4 text-sm font-black text-right text-rose-400">
                  R$ {detailedReportData.reduce((acc, p) => acc + p.cost, 0).toFixed(2)}
                </td>
                <td className="px-8 py-4 text-sm font-black text-right text-emerald-400">
                  R$ {detailedReportData.reduce((acc, p) => acc + p.profit, 0).toFixed(2)}
                </td>
                <td className="px-8 py-4 text-sm font-black text-right">
                  {detailedReportData.reduce((acc, p) => acc + p.revenue, 0) > 0 
                    ? ((detailedReportData.reduce((acc, p) => acc + p.profit, 0) / detailedReportData.reduce((acc, p) => acc + p.revenue, 0)) * 100).toFixed(1)
                    : 0}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
        </>
      )}

      {activeReport === 'operational' && (
        <div className="space-y-8">
          {/* Operational Metrics Cards */}
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl flex items-start gap-4 mx-1">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg shrink-0">
              <TrendingUp size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-blue-900">Como a Previsão é Calculada?</p>
              <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                As projeções financeiras são baseadas no <strong>preço médio de venda histórico</strong> de cada cultura (considerando vendas pagas, confirmadas e entregues). 
                Para que uma cultura como o <strong>Milho</strong> apareça na previsão, o nome configurado no plantio deve coincidir exatamente com o nome usado nos itens de venda (ex: "Milho").
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <Sprout size={20} />
                </div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Status Atual</span>
              </div>
              <p className="text-xl font-black text-slate-900">{productions.filter(p => p.status === 'growing').length} Lotes</p>
              <p className="text-[10px] text-slate-400 mt-1 uppercase font-black">Culturas em crescimento</p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:scale-110 transition-transform">
                <Calendar size={60} />
              </div>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <Clock size={20} />
                </div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Previsão 7 Dias</span>
              </div>
              <p className="text-xl font-black text-blue-600">
                R$ {forecastTimeframes.week.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              <div className="mt-2 flex items-center justify-between text-[10px]">
                <span className="text-slate-400 font-bold uppercase">Mês: R$ {forecastTimeframes.month.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                <span className="text-slate-400 font-bold uppercase ml-2">Ano: R$ {forecastTimeframes.year.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl shadow-slate-200 group relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-slate-800 text-emerald-400 rounded-lg">
                  <DollarSign size={20} />
                </div>
                <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Previsão Total</span>
              </div>
              <p className="text-xl font-black text-white">
                R$ {forecastTimeframes.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-slate-400 mt-1 uppercase font-black">Baseado em preço médio detectado</p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                  <Calendar size={20} />
                </div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Próxima Colheita</span>
              </div>
              <p className="text-xl font-black text-slate-900">
                {upcomingHarvests.length > 0 ? `${upcomingHarvests[0].daysToHarvest} dias` : 'N/A'}
              </p>
              <p className="text-[10px] text-slate-400 mt-1 uppercase font-black truncate">{upcomingHarvests[0]?.crop || 'Sem previsões'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Price reference card as a sidebar */}
            <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-fit">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-slate-50 text-slate-600 rounded-lg">
                  <ClipboardList size={20} />
                </div>
                <h3 className="font-bold text-slate-800">Preços Detectados</h3>
              </div>
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {Object.entries(averagePrices).length > 0 ? (
                  Object.entries(averagePrices)
                    .sort((a, b) => (b[1] as number) - (a[1] as number))
                    .map(([key, price]) => {
                      const originalName = salesByProduct.find(p => normalize(p.name) === key)?.name || key;
                      return (
                        <div key={key} className="flex justify-between items-center py-2 border-b border-dashed border-slate-100 last:border-0">
                          <span className="text-[11px] text-slate-600 capitalize leading-tight">{originalName.toLowerCase()}</span>
                          <span className="text-[11px] font-bold text-slate-900 text-right whitespace-nowrap ml-2">
                            R$ {(price as number).toFixed(2)}
                          </span>
                        </div>
                      );
                    })
                ) : (
                  <p className="text-xs text-slate-500 italic">Nenhum histórico encontrado.</p>
                )}
              </div>
              <div className="bg-amber-50 p-3 rounded-xl mt-4 border border-amber-100">
                <p className="text-[10px] text-amber-800 leading-relaxed font-medium">
                  <strong>Dica:</strong> O sistema busca no histórico de vendas (Milho bandeja, Milho sem casca, etc.) para calcular o faturamento do seu plantio de Milho.
                </p>
              </div>
            </div>

            <div className="lg:col-span-3 space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Planted per Culture Chart */}
                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-8">
                    <PieChartIcon className="text-emerald-600" size={20} />
                    Volume Plantado por Cultura
                  </h3>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={operationalStats} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          type="number" 
                          axisLine={false} 
                          tickLine={false} 
                          scale={useLogScale ? "log" : "auto"}
                          domain={useLogScale ? ['auto', 'auto'] : [0, 'auto']}
                        />
                        <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={100} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                        <Bar dataKey="quantity" name="Quantidade" fill="#10b981" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Forecast Revenue Chart */}
                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-8">
                    <DollarSign className="text-blue-600" size={20} />
                    Previsão de Faturamento por Cultura
                  </h3>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={operationalStats}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="forecastRevenue"
                          nameKey="name"
                        >
                          {operationalStats.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Comparison Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Forecast vs Actual Comparison */}
                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-8">
                    <TrendingUp className="text-emerald-600" size={20} />
                    Faturamento Real vs Previsto (Últimos Lotes)
                  </h3>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={harvestComparisonData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false}
                          scale={useLogScale ? "log" : "auto"}
                          domain={useLogScale ? ['auto', 'auto'] : [0, 'auto']}
                        />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                        <Legend />
                        <Bar dataKey="previsto" name="Previsto (Média Hist.)" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="real" name="Faturamento Real" fill="#059669" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Upcoming Harvests */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-6">
                    <Clock className="text-blue-600" size={20} />
                    Próximas Colheitas
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left border-b border-slate-100">
                          <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Cultura</th>
                          <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Data Est.</th>
                          <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 text-right">Previsão</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {upcomingHarvests.map((h, i) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 px-2">
                              <p className="text-xs font-bold text-slate-700">{h.crop}</p>
                              <p className="text-[10px] text-slate-400">{h.bed}</p>
                            </td>
                            <td className="py-3 px-2">
                              <p className="text-xs font-medium text-slate-600">
                                {format(h.estimatedHarvestDate?.toDate ? h.estimatedHarvestDate.toDate() : new Date(h.estimatedHarvestDate), 'dd/MM', { locale: ptBR })}
                              </p>
                              <p className={cn(
                                "text-[10px] font-bold",
                                h.daysToHarvest <= 3 ? "text-rose-500" : "text-emerald-500"
                              )}>
                                em {h.daysToHarvest} dias
                              </p>
                            </td>
                            <td className="py-3 px-2 text-right">
                              <p className="text-xs font-bold text-blue-600">
                                {h.hasPrice ? `R$ ${h.forecastRevenue.toFixed(2)}` : 'R$ ---'}
                              </p>
                              <p className="text-[10px] text-slate-400">{h.quantityPlanted} {h.unit}</p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* Productivity Analysis per Plant */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <TrendingUp className="text-emerald-600" size={20} />
                    Produtividade por Pé / Planta
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 uppercase font-black tracking-widest">Histórico de rendimento por cultura</p>
                </div>
                <div className="bg-emerald-50 px-3 py-1 rounded-full">
                  <span className="text-[10px] font-black text-emerald-600 uppercase">Média Real</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50">
                    <tr>
                      <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Cultura</th>
                      <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none text-center">Tipo</th>
                      <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none text-right">Rendimento Médio</th>
                      <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none text-right">Melhor Lote</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {productivityStats.map((stat, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-4">
                          <p className="text-xs font-bold text-slate-900">{stat.name}</p>
                          <p className="text-[10px] text-slate-400 uppercase font-black">{stat.batches} Lotes colhidos</p>
                        </td>
                        <td className="px-8 py-4 text-center">
                          <span className={cn(
                            "text-[8px] font-black uppercase px-2 py-1 rounded-full",
                            stat.isContinuous ? "bg-purple-50 text-purple-600" : "bg-blue-50 text-blue-600"
                          )}>
                            {stat.isContinuous ? "Várias Colheitas" : "Colheita Única"}
                          </span>
                        </td>
                        <td className="px-8 py-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-xs font-black text-slate-900">{stat.avgYield.toFixed(2)} {stat.unit}</span>
                            <span className="text-[8px] text-slate-400 uppercase font-black">Por pé / planta</span>
                          </div>
                        </td>
                        <td className="px-8 py-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-xs font-black text-emerald-600">{stat.peakYield.toFixed(2)} {stat.unit}</span>
                            <span className="text-[8px] text-slate-400 uppercase font-black">Recorde histórico</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {productivityStats.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-8 py-12 text-center text-slate-400 italic text-xs">
                          Aguardando primeiras colheitas para calcular produtividade.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100">
                <p className="text-[9px] text-slate-400 text-center leading-tight">
                  * Notas: Este relatório exibe apenas culturas de <strong>Colheita Contínua</strong> (Tomate, Pimenta, etc.). 
                  O rendimento é calculado somando todas as colheitas realizadas no lote e dividindo pela quantidade plantada.
                </p>
              </div>
            </div>

            {/* Input Consumption per Active Crops */}
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-8">
                <Package className="text-amber-600" size={20} />
                Insumos Consumidos (Lotes Atuais)
              </h3>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={inputStats} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      type="number" 
                      axisLine={false} 
                      tickLine={false} 
                      scale={useLogScale ? "log" : "auto"}
                      domain={useLogScale ? ['auto', 'auto'] : [0, 'auto']}
                    />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={100} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="value" name="Quantidade Usada" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Harvest Timeline Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="text-emerald-600" size={24} />
                  Cronograma de Colheiras e Projeções
                </h3>
                <p className="text-sm text-slate-500 mt-1">Previsão de disponibilidade e faturamento futuro.</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Cultura / Canteiro</th>
                    <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Previsão</th>
                    <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Dias Restantes</th>
                    <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Qtd. Prevista</th>
                    <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Faturamento Est.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {upcomingHarvests.map((h) => (
                    <tr key={h.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-4">
                        <div className="font-bold text-slate-900">{h.crop}</div>
                        <div className="text-xs text-slate-400">Local: {h.bed}</div>
                      </td>
                      <td className="px-8 py-4 text-sm text-slate-600 font-medium">
                        {h.estimatedHarvestDate?.toDate ? format(h.estimatedHarvestDate.toDate(), "dd/MM/yyyy") : format(new Date(h.estimatedHarvestDate), "dd/MM/yyyy")}
                      </td>
                      <td className="px-8 py-4">
                        <span className={cn(
                          "text-[10px] font-black uppercase px-2 py-1 rounded-full",
                          h.daysToHarvest <= 3 ? "bg-rose-50 text-rose-600" :
                          h.daysToHarvest <= 7 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
                        )}>
                          {h.daysToHarvest <= 0 ? 'Colheita Hoje!' : `${h.daysToHarvest} dias`}
                        </span>
                      </td>
                      <td className="px-8 py-4 text-sm font-bold text-slate-700 text-right">
                        {h.quantityPlanted} {h.unit}
                      </td>
                      <td className="px-8 py-4 text-sm font-black text-blue-600 text-right">
                        {h.hasPrice ? (
                          `R$ ${h.forecastRevenue.toFixed(2)}`
                        ) : (
                          <div className="flex flex-col items-end">
                            <span className="text-slate-400 italic">R$ ---</span>
                            <span className="text-[8px] text-amber-500 font-bold uppercase">Preço Hist. não encontrado</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {upcomingHarvests.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-8 py-12 text-center text-slate-400 italic">
                        Nenhuma previsão de colheita cadastrada para os lotes ativos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeReport === 'customer' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-slate-100">
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <User className="text-emerald-600" size={24} />
              Vendas por Cliente
            </h3>
            <p className="text-sm text-slate-500 mt-1">Ranking de clientes por volume de compras.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Cliente</th>
                  <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Qtd. Pedidos</th>
                  <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Total Comprado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {salesByCustomer.map((c, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-4 font-bold text-slate-900">{c.customerName}</td>
                    <td className="px-8 py-4 text-center text-slate-600">{c.count}</td>
                    <td className="px-8 py-4 text-right font-bold text-emerald-600">R$ {c.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeReport === 'product' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-slate-100">
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Package className="text-emerald-600" size={24} />
              Vendas por Produto
            </h3>
            <p className="text-sm text-slate-500 mt-1">Ranking de produtos mais vendidos.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Produto</th>
                  <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Quantidade Vendida</th>
                  <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Total em Vendas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {salesByProduct.map((p, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-4 font-bold text-slate-900">{p.name}</td>
                    <td className="px-8 py-4 text-center text-slate-600">{p.quantity}</td>
                    <td className="px-8 py-4 text-right font-bold text-emerald-600">R$ {p.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeReport === 'pending_deliveries' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
          <div className="p-4 md:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-1.5 leading-none">
                <ShoppingBag className="text-amber-600" size={18} />
                Entregas Delivery Pendentes
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">Pedidos aguardando separação e entrega ao cliente.</p>
            </div>
            
            <button
              onClick={() => window.print()}
              className="flex items-center justify-center gap-1.5 bg-slate-950 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-[11px] font-bold transition-all shadow-sm"
              title="Gera um relatório PDF limpo pronto para impressão"
            >
              <Printer size={13} />
              Imprimir Relatório (PDF)
            </button>
          </div>

          <div className="px-4 md:px-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-slate-100 bg-white rounded-xl p-3">
              <div className="flex flex-wrap items-center gap-1 md:gap-1.5">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider mr-1">Filtrar Remessa:</span>
                {[
                  { id: 'all', label: 'Todas' },
                  { id: 'today', label: 'Hoje' },
                  { id: 'tomorrow', label: 'Amanhã' },
                  { id: 'next7', label: '7 dias' },
                  { id: 'custom', label: 'Personalizado' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setDeliveryFilterPreset(p.id as any)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border",
                      deliveryFilterPreset === p.id
                        ? "bg-amber-100 border-amber-300 text-amber-800 shadow-sm"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {deliveryFilterPreset === 'custom' && (
                <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200 shrink-0 self-start sm:self-auto">
                  <input
                    type="date"
                    value={deliveryDateStart}
                    onChange={(e) => setDeliveryDateStart(e.target.value)}
                    className="bg-transparent text-[10px] font-bold text-slate-700 focus:outline-none border-0 p-0 pl-1 w-24"
                    title="Início"
                  />
                  <span className="text-slate-300 text-[10px] px-0.5">-</span>
                  <input
                    type="date"
                    value={deliveryDateEnd}
                    onChange={(e) => setDeliveryDateEnd(e.target.value)}
                    className="bg-transparent text-[10px] font-bold text-slate-700 focus:outline-none border-0 p-0 pl-1 w-24"
                    title="Fim"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 md:px-5">
            <div className="border border-slate-100 bg-slate-50/50 p-2 rounded-xl">
              <p className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Pedidos Filtrados</p>
              <h4 className="text-base font-black text-slate-800 leading-none mt-1">{filteredPendingDeliveries.length}</h4>
            </div>
            <div className="border border-slate-100 bg-slate-50/50 p-2 rounded-xl">
              <p className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Faturamento Pendente</p>
              <h4 className="text-base font-black text-emerald-600 leading-none mt-1">
                R$ {filteredPendingDeliveries.reduce((acc, s) => acc + s.total, 0).toFixed(2)}
              </h4>
            </div>
          </div>

          <div className="overflow-x-auto pb-4">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/60 border-b border-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-2 px-3 text-[9px]">Cliente / Contato</th>
                  <th className="py-2 px-3 text-[9px]">Previsão Entrega</th>
                  <th className="py-2 px-3 text-[9px]">Endereço de Entrega</th>
                  <th className="py-2 px-3 text-[9px]">Itens do Pedido</th>
                  <th className="py-2 px-3 text-[9px] text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredPendingDeliveries.map((s, idx) => {
                  const dDate = parseFirebaseDate(s.deliveryDate);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="py-1.5 px-3">
                        <div className="space-y-0.5">
                          <p className="font-bold text-slate-900 text-xs flex items-center gap-1">
                            <span className="text-[8px] px-1 py-0.2 bg-slate-100 border border-slate-200 rounded text-slate-500 font-mono font-bold leading-none">
                              {s.saleNumber || `#${idx + 1}`}
                            </span>
                            {s.customerName}
                          </p>
                          {getCustomerPhone(s) && (
                            <p className="text-[9px] text-slate-400 font-bold leading-none">{getCustomerPhone(s)}</p>
                          )}
                        </div>
                      </td>
                      <td className="py-1.5 px-3 font-medium text-slate-500 whitespace-nowrap">
                        {dDate ? (
                          <div className="flex items-center gap-1 font-bold text-slate-700 text-[10px] bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded w-max">
                            <Calendar size={10} className="text-amber-500 shrink-0" />
                            {safeFormatDate(s.deliveryDate, "dd/MM/yyyy")}
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Não agendado</span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 max-w-xs truncate text-slate-600 font-medium text-[11px]" title={s.deliveryAddress}>
                        {s.deliveryAddress || <span className="text-slate-400 italic text-[10px]">Retirada Local</span>}
                      </td>
                      <td className="py-1.5 px-3">
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {s.items.map((item, i) => (
                            <span key={i} className="text-[9px] bg-emerald-50/60 border border-emerald-100/50 text-emerald-800 px-1.5 py-0.2 rounded font-mono font-bold leading-none">
                              {item.quantity}x {item.name}
                            </span>
                          ))}
                        </div>
                        {s.observations && (
                          <p className="text-[9.5px] text-amber-700 bg-amber-50 border border-amber-100/60 rounded px-1.5 py-0.5 mt-1 font-semibold italic max-w-sm truncate" title={s.observations}>
                            Obs: {s.observations}
                          </p>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right font-black text-slate-900 text-xs whitespace-nowrap">
                        R$ {s.total.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
                {filteredPendingDeliveries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400 italic font-medium">
                      Nenhuma entrega pendente encontrada para este intervalo selecionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeReport === 'receivables' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-slate-100">
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <DollarSign className="text-blue-600" size={24} />
              Valores a Receber
            </h3>
            <p className="text-sm text-slate-500 mt-1">Pedidos entregues ou pendentes que ainda não foram pagos.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Cliente</th>
                  <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-8 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sales
                  .filter(s => ['ordered', 'pending_delivery', 'delivered', 'pending'].includes(s.status))
                  .map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-4 font-bold text-slate-900">{s.customerName}</td>
                    <td className="px-8 py-4">
                      <span className="text-[10px] font-black uppercase px-2 py-1 rounded-full bg-blue-50 text-blue-600">
                        {s.status === 'delivered' ? 'Entregue' : 'Pendente'}
                      </span>
                    </td>
                    <td className="px-8 py-4 text-right font-bold text-blue-600">R$ {s.total.toFixed(2)}</td>
                  </tr>
                ))}
                {sales.filter(s => ['ordered', 'pending_delivery', 'delivered', 'pending'].includes(s.status)).length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-8 py-12 text-center text-slate-400 italic">Nenhum valor a receber.</td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-slate-900 text-white">
                <tr>
                  <td colSpan={2} className="px-8 py-4 font-bold uppercase tracking-wider text-xs">Total a Receber</td>
                  <td className="px-8 py-4 text-right font-black text-emerald-400">
                    R$ {sales.filter(s => ['ordered', 'pending_delivery', 'delivered', 'pending'].includes(s.status)).reduce((acc, s) => acc + s.total, 0).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      </div>

      {/* PRINT-ONLY RELATÓRIO DE ENTREGAS COMPACTO EM PAISAGEM */}
      <style dangerouslySetInnerHTML={{ __html: `
        /* Oculta completamente o bloco no modo de visualização em tela */
        .only-print-landscape {
          display: none !important;
        }

        @media print {
          /* Define a folha no tamanho A4 Horizontal (Paisagem) */
          @page {
            size: A4 landscape !important;
            margin: 6mm 8mm 6mm 8mm !important;
          }

          /* Oculta cabeçalhos, menus laterais e botões da tela durante a impressão */
          .no-print,
          .print\\:hidden,
          aside,
          header,
          button,
          nav {
            display: none !important;
          }

          /* Libera as restrições de overflow e height dos containers ancestrais para não cortar folhas no print */
          html, body, #root, .min-h-screen, main, [class*="overflow-"], [class*="max-h-"], [class*="p-"] {
            overflow: visible !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            position: static !important;
            background: white !important;
            color: black !important;
            display: block !important;
            box-shadow: none !important;
          }

          /* Exibe o elemento de relatório exclusivo de impressão */
          .only-print-landscape {
            display: block !important;
            visibility: visible !important;
            background: white !important;
            color: black !important;
            width: 100% !important;
            position: relative !important;
          }

          /* Evita quebras de linha dentro do mesmo pedido */
          tr.print-item-row {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}} />

      <div className="only-print-landscape font-sans p-2 bg-white text-slate-900 w-full">
        {/* Header Compacto da Folha em Paisagem */}
        <div className="border-b-[3px] border-slate-950 pb-2 flex justify-between items-end">
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase leading-none">Manifesto de Entregas Pendentes</h1>
            <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase">Logística de Despacho e Rotas em Campo</p>
          </div>
          <div className="text-right text-[10px] text-slate-600 font-medium">
            <p className="font-bold">Emissão: <span className="font-mono">{format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span></p>
            <p className="mt-0.5">
              <b>Período:</b> {
                deliveryFilterPreset === 'all' ? 'Todas as Pendentes' :
                deliveryFilterPreset === 'today' ? 'Hoje' :
                deliveryFilterPreset === 'tomorrow' ? 'Amanhã' :
                deliveryFilterPreset === 'next7' ? 'Próximos 7 Dias' :
                `De ${deliveryDateStart ? safeFormatDate(deliveryDateStart) : 'Início'} até ${deliveryDateEnd ? safeFormatDate(deliveryDateEnd) : 'Fim'}`
              }
            </p>
          </div>
        </div>

        {/* Resumo e Indicadores do Manifesto */}
        <div className="flex justify-between items-center text-[10px] border border-slate-300 px-4 py-2 rounded-lg bg-slate-50 my-2.5">
          <div>
            <span className="font-bold text-slate-500 uppercase tracking-wider text-[9px]">Total de Remessas:</span>{' '}
            <span className="font-black text-slate-800 text-xs">
              {filteredPendingDeliveries.length} {filteredPendingDeliveries.length === 1 ? 'pedido em rota' : 'pedidos em rota'}
            </span>
          </div>
          <div className="text-right">
            <span className="font-bold text-slate-500 uppercase tracking-wider text-[9px]">Valor Total a Receber:</span>{' '}
            <span className="font-black text-emerald-800 text-xs font-mono">
              R$ {filteredPendingDeliveries.reduce((acc, s) => acc + s.total, 0).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Tabela de Alto Contraste Paisagem baseada na Visualização da Tela */}
        <table className="w-full text-left border-collapse border-2 border-slate-900">
          <thead>
            <tr className="bg-slate-100 text-[10px] font-black uppercase text-slate-700 tracking-wider border-b-2 border-slate-900">
              <th className="py-1.5 px-2 border border-slate-400 text-center w-[6%] font-mono">Nº / Ref</th>
              <th className="py-1.5 px-2 border border-slate-400 w-[18%]">Cliente / Contato</th>
              <th className="py-1.5 px-2 border border-slate-400 w-[11%]">Previsão</th>
              <th className="py-1.5 px-2 border border-slate-400 w-[26%]">Endereço de Entrega</th>
              <th className="py-1.5 px-2 border border-slate-400 w-[21%]">Itens do Pedido</th>
              <th className="py-1.5 px-2 border border-slate-400 w-[11%]">Observações / Instruções</th>
              <th className="py-1.5 px-2 border border-slate-400 text-right w-[7%]">Total</th>
            </tr>
          </thead>
          <tbody className="text-[10px] divide-y divide-slate-400">
            {filteredPendingDeliveries.map((s, idx) => {
              const dDate = parseFirebaseDate(s.deliveryDate);
              const pmStr = s.paymentMethods && s.paymentMethods.length > 0 
                ? s.paymentMethods.map(pm => pm.method).join(', ') 
                : 'Pagar na Entrega';

              return (
                <tr key={s.id} className="print-item-row text-slate-900 border-b border-slate-400">
                  {/* Número Seq/Ref do Pedido */}
                  <td className="py-2 px-2 border border-slate-400 text-center font-mono font-black bg-slate-50">
                    #{s.saleNumber || `${idx + 1}`}
                  </td>

                  {/* Cliente e Celular */}
                  <td className="py-2 px-2 border border-slate-400">
                    <div className="font-black text-slate-955 text-[11px] leading-tight">{s.customerName}</div>
                    {getCustomerPhone(s) && (
                      <div className="text-[9px] text-slate-500 font-bold mt-0.5 font-mono">{getCustomerPhone(s)}</div>
                    )}
                  </td>

                  {/* Previsão de Entrega */}
                  <td className="py-2 px-2 border border-slate-400 font-bold text-slate-700 whitespace-nowrap text-center">
                    {dDate ? safeFormatDate(s.deliveryDate, "dd/MM/yyyy") : <span className="text-slate-400 italic">Não agendado</span>}
                  </td>

                  {/* Endereço de Entrega */}
                  <td className="py-2 px-2 border border-slate-400 font-extrabold text-[10px] leading-snug uppercase text-slate-900">
                    {s.deliveryAddress || <span className="text-slate-500 italic lowercase font-medium">Retirada Local / Horta</span>}
                  </td>

                  {/* Itens do Pedido */}
                  <td className="py-2 px-2 border border-slate-400">
                    <div className="flex flex-wrap gap-1 font-mono text-[9px]">
                      {s.items.map((item, i) => {
                        const qty = typeof item.quantity === 'number' ? item.quantity : Number(item.quantity) || 0;
                        return (
                          <span key={i} className="bg-slate-100 border border-slate-300 text-slate-900 px-1 py-0.2 rounded font-bold whitespace-nowrap">
                            {qty}x {item.name}
                          </span>
                        );
                      })}
                    </div>
                  </td>

                  {/* Observações */}
                  <td className="py-2 px-2 border border-slate-400 text-[9px] leading-tight text-slate-700 italic font-medium">
                    {s.observations?.trim() ? s.observations : "—"}
                  </td>

                  {/* Total e Forma de Cobrança */}
                  <td className="py-2 px-2 border border-slate-400 text-right font-mono whitespace-nowrap">
                    <div className="font-black text-[11px] text-slate-950">R$ {s.total.toFixed(2)}</div>
                    <div className="text-[7.5px] text-slate-500 font-extrabold font-sans uppercase tracking-tighter mt-0.5">{pmStr}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredPendingDeliveries.length === 0 && (
          <div className="text-center py-8 text-slate-400 italic font-bold border border-dashed border-slate-300 rounded-lg text-xs mt-4">
            Nenhuma entrega pendente encontrada para este intervalo selecionado.
          </div>
        )}
      </div>
    </>
  );
}
