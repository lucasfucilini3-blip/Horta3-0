import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Sale, Transaction, Production, Customer } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell, PieChart, Pie, Legend } from 'recharts';
import { format, subDays, startOfDay, endOfDay, isWithinInterval, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart3, TrendingUp, TrendingDown, DollarSign, ShoppingBag, PieChart as PieChartIcon, Activity, Filter, Calendar, Search, Printer, User, Package, Sprout, Clock, Target, ClipboardList, Tag, Users, Layers, ArrowUpDown, ChevronDown, ChevronRight, Download, FileSpreadsheet, Sparkles, CheckCircle2 } from 'lucide-react';
import { useAuth, handleFirestoreError, OperationType, cn } from '../App';
import { getCanonicalProductName, normalizeProductName, stripAccentsAndSpecial } from '../productUtils';

export default function Reports() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [productions, setProductions] = useState<Production[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [fairs, setFairs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeReport, setActiveReport] = useState<'general' | 'operational' | 'customer' | 'product' | 'product_by_customer' | 'pending_deliveries' | 'receivables' | 'expenses' | 'sales_by_channel'>('general');

  // Filters for Sales by Channel report
  const [channelFilterPreset, setChannelFilterPreset] = useState<'all' | 'today' | 'yesterday' | 'last7' | 'last30' | 'month' | 'custom'>('last30');
  const [channelDateStart, setChannelDateStart] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [channelDateEnd, setChannelDateEnd] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Filters for Product x Customer report
  const [prodCustPreset, setProdCustPreset] = useState<'all' | 'today' | 'yesterday' | 'last7' | 'last30' | 'month' | 'custom'>('last30');
  const [prodCustDateStart, setProdCustDateStart] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [prodCustDateEnd, setProdCustDateEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [prodCustSearchQuery, setProdCustSearchQuery] = useState('');
  const [prodCustSelectedProduct, setProdCustSelectedProduct] = useState<string>('all');
  const [prodCustSelectedCustomer, setProdCustSelectedCustomer] = useState<string>('all');
  const [prodCustViewMode, setProdCustViewMode] = useState<'product' | 'customer' | 'detailed'>('product');
  const [prodCustExpandedKeys, setProdCustExpandedKeys] = useState<Record<string, boolean>>({});

  // Filters for Expense report
  const [expenseFilterPreset, setExpenseFilterPreset] = useState<'week' | 'month' | 'custom'>('month');
  const [expenseDateStart, setExpenseDateStart] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [expenseDateEnd, setExpenseDateEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [expenseSearchQuery, setExpenseSearchQuery] = useState('');
  const [expenseSelectedCategory, setExpenseSelectedCategory] = useState<string>('all');

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

  // Filters for Product Sales report
  const [productFilterPreset, setProductFilterPreset] = useState<'all' | 'today' | 'yesterday' | 'last7' | 'last30' | 'custom'>('all');
  const [productDateStart, setProductDateStart] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [productDateEnd, setProductDateEnd] = useState(format(new Date(), 'yyyy-MM-dd'));

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
    const fairsQ = query(collection(db, 'fairs'), orderBy('date', 'desc'));

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

    const unsubFairs = onSnapshot(fairsQ, (snapshot) => {
      setFairs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubSales(); unsubTrans(); unsubProd(); unsubCust(); unsubFairs(); };
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
        const canonicalName = getCanonicalProductName(item.name);
        const normName = normalizeProductName(item.name);
        const existing = acc.find(a => normalizeProductName(a.name) === normName);
        const revenue = item.price * item.quantity;
        const cost = (item.cost || 0) * item.quantity;
        const profit = revenue - cost;
        
        if (existing) {
          existing.revenue += revenue;
          existing.cost += cost;
          existing.profit += profit;
        } else {
          acc.push({ name: canonicalName, revenue, cost, profit });
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

  // Sales by Product (Filtered by date selection)
  const salesByProduct = sales
    .filter((s) => {
      // Excludes cancelled sales, includes active sales
      const isValid = s.status !== 'cancelled';
      if (!isValid) return false;

      if (productFilterPreset === 'all') return true;

      const sDate = parseFirebaseDate(s.createdAt);
      if (!sDate) return false;

      const todayDate = new Date();

      if (productFilterPreset === 'today') {
        const start = startOfDay(todayDate);
        const end = endOfDay(todayDate);
        return sDate >= start && sDate <= end;
      }
      if (productFilterPreset === 'yesterday') {
        const yesterday = subDays(todayDate, 1);
        const start = startOfDay(yesterday);
        const end = endOfDay(yesterday);
        return sDate >= start && sDate <= end;
      }
      if (productFilterPreset === 'last7') {
        const start = startOfDay(subDays(todayDate, 7));
        const end = endOfDay(todayDate);
        return sDate >= start && sDate <= end;
      }
      if (productFilterPreset === 'last30') {
        const start = startOfDay(subDays(todayDate, 30));
        const end = endOfDay(todayDate);
        return sDate >= start && sDate <= end;
      }
      if (productFilterPreset === 'custom') {
        if (productDateStart) {
          const start = startOfDay(new Date(productDateStart + 'T00:00:00'));
          if (sDate < start) return false;
        }
        if (productDateEnd) {
          const end = endOfDay(new Date(productDateEnd + 'T23:59:59'));
          if (sDate > end) return false;
        }
      }
      return true;
    })
    .reduce((acc: any[], s) => {
      s.items.forEach(item => {
        const canonicalName = getCanonicalProductName(item.name);
        const normName = normalizeProductName(item.name);
        const existing = acc.find(a => normalizeProductName(a.name) === normName);
        if (existing) {
          existing.total += item.price * item.quantity;
          existing.quantity += item.quantity;
        } else {
          acc.push({ name: canonicalName, total: item.price * item.quantity, quantity: item.quantity });
        }
      });
      return acc;
    }, [])
    .sort((a, b) => b.total - a.total);

  // Historical Sales by Product for average prices calculation (across all history)
  const allSalesByProduct = sales
    .filter(s => ['paid', 'confirmed', 'delivered'].includes(s.status))
    .reduce((acc: any[], s) => {
      s.items.forEach(item => {
        const canonicalName = getCanonicalProductName(item.name);
        const normName = normalizeProductName(item.name);
        const existing = acc.find(a => normalizeProductName(a.name) === normName);
        if (existing) {
          existing.total += item.price * item.quantity;
          existing.quantity += item.quantity;
        } else {
          acc.push({ name: canonicalName, total: item.price * item.quantity, quantity: item.quantity });
        }
      });
      return acc;
    }, [])
    .sort((a, b) => b.total - a.total);

  // Average Prices with aggressive keys (utilizes all historical sales by default for better predictions)
  const averagePrices = allSalesByProduct.reduce((acc: any, p) => {
    acc[normalizeProductName(p.name)] = p.total / p.quantity;
    return acc;
  }, {});

  // Helper to find average price with fuzzy fallback
  const getAveragePrice = (cropName: string) => {
    if (!cropName) return 0;
    const normCrop = normalizeProductName(cropName);
    
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
      .map(w => stripAccentsAndSpecial(w))
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

  // Calculation block for the Expense Report
  const filteredExpenses = transactions.filter(t => {
    if (t.type !== 'expense') return false;
    const tDate = parseFirebaseDate(t.date);
    if (!tDate) return false;

    // Filter by Date Preset
    const today = new Date();
    let matchesDate = false;
    if (expenseFilterPreset === 'week') {
      const start = startOfWeek(today, { weekStartsOn: 1 }); // 1 is Monday in BR
      const end = endOfWeek(today, { weekStartsOn: 1 });
      matchesDate = tDate >= start && tDate <= end;
    } else if (expenseFilterPreset === 'month') {
      const start = startOfMonth(today);
      const end = endOfMonth(today);
      matchesDate = tDate >= start && tDate <= end;
    } else if (expenseFilterPreset === 'custom') {
      let isAfterStart = true;
      let isBeforeEnd = true;
      if (expenseDateStart) {
        const start = startOfDay(new Date(expenseDateStart + 'T00:00:00'));
        isAfterStart = tDate >= start;
      }
      if (expenseDateEnd) {
        const end = endOfDay(new Date(expenseDateEnd + 'T23:59:59'));
        isBeforeEnd = tDate <= end;
      }
      matchesDate = isAfterStart && isBeforeEnd;
    }

    // Filter by category
    const matchesCategory = expenseSelectedCategory === 'all' || t.category === expenseSelectedCategory;

    // Filter by search query
    const searchLower = expenseSearchQuery.trim().toLowerCase();
    const matchesSearch = !searchLower || 
      (t.description || '').toLowerCase().includes(searchLower) ||
      (t.category || '').toLowerCase().includes(searchLower);

    return matchesDate && matchesCategory && matchesSearch;
  });

  // Calculate dynamic list of categories present in the current filter selection or general
  const expenseCategoriesList = Array.from(new Set(
    transactions
      .filter(t => t.type === 'expense' && t.category)
      .map(t => t.category)
  )).sort();

  // Sort filtered expenses chronologically (or reverse for table list)
  const sortedExpensesTable = [...filteredExpenses].sort((a, b) => {
    const d1 = parseFirebaseDate(a.date) || new Date(0);
    const d2 = parseFirebaseDate(b.date) || new Date(0);
    return d2.getTime() - d1.getTime(); // newest first for listing
  });

  // Calculate stats
  const totalExpenseFiltered = filteredExpenses.reduce((acc, t) => acc + t.amount, 0);

  // Daily Average
  let expenseDiffDays = 1;
  const todayVal = new Date();
  if (expenseFilterPreset === 'week') {
    expenseDiffDays = 7;
  } else if (expenseFilterPreset === 'month') {
    expenseDiffDays = new Date(todayVal.getFullYear(), todayVal.getMonth() + 1, 0).getDate();
  } else if (expenseFilterPreset === 'custom') {
    const start = new Date(expenseDateStart + 'T00:00:00');
    const end = new Date(expenseDateEnd + 'T00:00:00');
    const diffTime = Math.abs(end.getTime() - start.getTime());
    expenseDiffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }
  const expenseDailyAvg = totalExpenseFiltered / (expenseDiffDays || 1);

  // Top Category
  const expenseFilteredByCategoryMap = filteredExpenses.reduce((acc: { [key: string]: number }, t) => {
    acc[t.category] = (acc[t.category] || 0) + t.amount;
    return acc;
  }, {});

  const expenseCategoryChartData = Object.entries(expenseFilteredByCategoryMap)
    .map(([name, value]) => ({ name, value: value as number }))
    .sort((a, b) => b.value - a.value);

  const topExpenseCategoryFiltered = expenseCategoryChartData[0] || { name: 'Nenhuma', value: 0 };

  // Highest Single Expense
  const maxExpenseFiltered = filteredExpenses.length > 0 
    ? Math.max(...filteredExpenses.map(t => t.amount))
    : 0;
  const maxExpenseFilteredItem = filteredExpenses.find(t => t.amount === maxExpenseFiltered);

  // Timeline grouping (Day by Day)
  const expenseTimelineGrouped = filteredExpenses.reduce((acc: any[], t) => {
    const d = parseFirebaseDate(t.date);
    if (!d) return acc;
    const dateStr = format(d, 'yyyy-MM-dd');
    const displayStr = format(d, 'dd/MM');
    const existing = acc.find(item => item.rawDate === dateStr);
    if (existing) {
      existing.amount += t.amount;
    } else {
      acc.push({ rawDate: dateStr, name: displayStr, amount: t.amount });
    }
    return acc;
  }, []);

  const expenseTimelineSorted = expenseTimelineGrouped.sort((a, b) => a.rawDate.localeCompare(b.rawDate));

  // ==========================================
  // COMPUTATIONS FOR SALES BY CHANNEL REPORT
  // ==========================================
  const isChannelDateInInterval = (dDate: Date) => {
    const todayDate = new Date();
    if (channelFilterPreset === 'all') return true;
    if (channelFilterPreset === 'today') {
      return dDate >= startOfDay(todayDate) && dDate <= endOfDay(todayDate);
    }
    if (channelFilterPreset === 'yesterday') {
      const yesterday = subDays(todayDate, 1);
      return dDate >= startOfDay(yesterday) && dDate <= endOfDay(yesterday);
    }
    if (channelFilterPreset === 'last7') {
      return dDate >= startOfDay(subDays(todayDate, 7)) && dDate <= endOfDay(todayDate);
    }
    if (channelFilterPreset === 'last30') {
      return dDate >= startOfDay(subDays(todayDate, 30)) && dDate <= endOfDay(todayDate);
    }
    if (channelFilterPreset === 'month') {
      return dDate >= startOfMonth(todayDate) && dDate <= endOfMonth(todayDate);
    }
    if (channelFilterPreset === 'custom') {
      if (channelDateStart) {
        const start = startOfDay(new Date(channelDateStart + 'T00:00:00'));
        if (dDate < start) return false;
      }
      if (channelDateEnd) {
        const end = endOfDay(new Date(channelDateEnd + 'T23:59:59'));
        if (dDate > end) return false;
      }
      return true;
    }
    return true;
  };

  const filteredSalesForChannel = sales.filter(s => {
    if (s.status === 'cancelled') return false;
    const sDate = parseFirebaseDate(s.createdAt);
    if (!sDate) return false;
    return isChannelDateInInterval(sDate);
  });

  const filteredFairsForChannel = fairs.filter(f => {
    const fDate = parseFirebaseDate(f.date || f.createdAt);
    if (!fDate) return false;
    return isChannelDateInInterval(fDate);
  });

  // Calculate totals
  let totalDeliveryAmt = 0;
  let totalDeliveryCount = 0;
  let totalNormalAmt = 0;
  let totalNormalCount = 0;
  let totalFairAmt = 0;
  let totalFairCount = 0;
  let totalOverallAmt = 0;

  filteredSalesForChannel.forEach(s => {
    const isDelivery = s.isDelivery === true || !!s.deliveryAddress?.trim();
    const amt = s.total || 0;
    if (isDelivery) {
      totalDeliveryAmt += amt;
      totalDeliveryCount += 1;
    } else {
      totalNormalAmt += amt;
      totalNormalCount += 1;
    }
    totalOverallAmt += amt;
  });

  filteredFairsForChannel.forEach(f => {
    const amt = f.totalSalesAmount || 0;
    totalFairAmt += amt;
    totalFairCount += 1;
    totalOverallAmt += amt;
  });

  const channelDailyDataMap: { [dateStr: string]: {
    date: string;
    formattedDate: string;
    deliveryAmt: number;
    deliveryCount: number;
    normalAmt: number;
    normalCount: number;
    fairAmt: number;
    fairCount: number;
    totalAmt: number;
  } } = {};

  filteredSalesForChannel.forEach(s => {
    const sDate = parseFirebaseDate(s.createdAt);
    if (!sDate) return;
    const dateKey = format(sDate, 'yyyy-MM-dd');
    const formattedDate = format(sDate, 'dd/MM/yyyy');
    
    if (!channelDailyDataMap[dateKey]) {
      channelDailyDataMap[dateKey] = {
        date: dateKey,
        formattedDate,
        deliveryAmt: 0,
        deliveryCount: 0,
        normalAmt: 0,
        normalCount: 0,
        fairAmt: 0,
        fairCount: 0,
        totalAmt: 0
      };
    }
    
    const isDelivery = s.isDelivery === true || !!s.deliveryAddress?.trim();
    const amt = s.total || 0;
    
    if (isDelivery) {
      channelDailyDataMap[dateKey].deliveryAmt += amt;
      channelDailyDataMap[dateKey].deliveryCount += 1;
    } else {
      channelDailyDataMap[dateKey].normalAmt += amt;
      channelDailyDataMap[dateKey].normalCount += 1;
    }
    channelDailyDataMap[dateKey].totalAmt += amt;
  });

  filteredFairsForChannel.forEach(f => {
    const fDate = parseFirebaseDate(f.date || f.createdAt);
    if (!fDate) return;
    const dateKey = format(fDate, 'yyyy-MM-dd');
    const formattedDate = format(fDate, 'dd/MM/yyyy');
    
    if (!channelDailyDataMap[dateKey]) {
      channelDailyDataMap[dateKey] = {
        date: dateKey,
        formattedDate,
        deliveryAmt: 0,
        deliveryCount: 0,
        normalAmt: 0,
        normalCount: 0,
        fairAmt: 0,
        fairCount: 0,
        totalAmt: 0
      };
    }
    
    const amt = f.totalSalesAmount || 0;
    channelDailyDataMap[dateKey].fairAmt += amt;
    channelDailyDataMap[dateKey].fairCount += 1;
    channelDailyDataMap[dateKey].totalAmt += amt;
  });

  // ==========================================
  // COMPUTATIONS FOR PRODUCT X CUSTOMER REPORT
  // ==========================================
  const isProdCustDateInInterval = (dDate: Date) => {
    const todayDate = new Date();
    if (prodCustPreset === 'all') return true;
    if (prodCustPreset === 'today') {
      return dDate >= startOfDay(todayDate) && dDate <= endOfDay(todayDate);
    }
    if (prodCustPreset === 'yesterday') {
      const yesterday = subDays(todayDate, 1);
      return dDate >= startOfDay(yesterday) && dDate <= endOfDay(yesterday);
    }
    if (prodCustPreset === 'last7') {
      return dDate >= startOfDay(subDays(todayDate, 7)) && dDate <= endOfDay(todayDate);
    }
    if (prodCustPreset === 'last30') {
      return dDate >= startOfDay(subDays(todayDate, 30)) && dDate <= endOfDay(todayDate);
    }
    if (prodCustPreset === 'month') {
      return dDate >= startOfMonth(todayDate) && dDate <= endOfMonth(todayDate);
    }
    if (prodCustPreset === 'custom') {
      if (prodCustDateStart) {
        const start = startOfDay(new Date(prodCustDateStart + 'T00:00:00'));
        if (dDate < start) return false;
      }
      if (prodCustDateEnd) {
        const end = endOfDay(new Date(prodCustDateEnd + 'T23:59:59'));
        if (dDate > end) return false;
      }
      return true;
    }
    return true;
  };

  // Extract all unique product and customer names from all sales & catalog for dropdown filters
  const allProductOptions: string[] = Array.from(
    new Set<string>(
      sales
        .flatMap(s => (s.items || []).map(item => getCanonicalProductName(item.name?.trim())))
        .filter((item): item is string => !!item && item.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));

  const allCustomerOptions: string[] = Array.from(
    new Set<string>([
      ...sales.map(s => s.customerName?.trim()).filter((name): name is string => !!name && name.length > 0),
      ...customers.map(c => (c.companyName || c.contactName)?.trim()).filter((name): name is string => !!name && name.length > 0)
    ])
  ).sort((a, b) => a.localeCompare(b));

  // Flatten valid sales items within the filtered date range and criteria
  interface ProdCustItemFlat {
    id: string;
    saleId: string;
    saleNumber: string;
    saleDate: Date | null;
    customerName: string;
    customerPhone: string;
    productName: string;
    rawProductName?: string;
    quantity: number;
    unitPrice: number;
    total: number;
    status: string;
    isDelivery: boolean;
  }

  const rawFilteredSalesForProdCust = sales.filter(s => {
    if (s.status === 'cancelled') return false;
    const sDate = parseFirebaseDate(s.createdAt);
    if (!sDate) return false;
    return isProdCustDateInInterval(sDate);
  });

  const flatSalesItemsForProdCust: ProdCustItemFlat[] = [];
  rawFilteredSalesForProdCust.forEach((s, sIdx) => {
    const sDate = parseFirebaseDate(s.createdAt);
    const cName = s.customerName?.trim() || 'Cliente Não Identificado';
    const cPhone = getCustomerPhone(s);
    const saleNum = s.saleNumber || `#${sIdx + 1}`;
    const isDel = s.isDelivery === true || !!s.deliveryAddress?.trim();

    (s.items || []).forEach((item, itemIdx) => {
      const rawPName = item.name?.trim() || 'Produto Sem Nome';
      const canonicalPName = getCanonicalProductName(rawPName);
      const qty = typeof item.quantity === 'number' ? item.quantity : Number(item.quantity) || 0;
      const price = typeof item.price === 'number' ? item.price : Number(item.price) || 0;
      const tot = qty * price;

      // Filter by selected product (normalized comparison)
      if (prodCustSelectedProduct !== 'all' && normalizeProductName(canonicalPName) !== normalizeProductName(prodCustSelectedProduct)) {
        return;
      }

      // Filter by selected customer
      if (prodCustSelectedCustomer !== 'all' && normalize(cName) !== normalize(prodCustSelectedCustomer)) {
        return;
      }

      // Filter by search query
      if (prodCustSearchQuery.trim()) {
        const queryNorm = stripAccentsAndSpecial(prodCustSearchQuery);
        const matchProd = normalizeProductName(canonicalPName).includes(queryNorm) || stripAccentsAndSpecial(rawPName).includes(queryNorm);
        const matchCust = stripAccentsAndSpecial(cName).includes(queryNorm);
        const matchSaleNum = stripAccentsAndSpecial(saleNum).includes(queryNorm);
        const matchPhone = stripAccentsAndSpecial(cPhone).includes(queryNorm);
        if (!matchProd && !matchCust && !matchSaleNum && !matchPhone) {
          return;
        }
      }

      flatSalesItemsForProdCust.push({
        id: `${s.id}_${itemIdx}`,
        saleId: s.id,
        saleNumber: saleNum,
        saleDate: sDate,
        customerName: cName,
        customerPhone: cPhone,
        productName: canonicalPName,
        rawProductName: rawPName,
        quantity: qty,
        unitPrice: price,
        total: tot,
        status: s.status,
        isDelivery: isDel
      });
    });
  });

  // KPIs
  const prodCustTotalRevenue = flatSalesItemsForProdCust.reduce((acc, i) => acc + i.total, 0);
  const prodCustTotalQuantity = flatSalesItemsForProdCust.reduce((acc, i) => acc + i.quantity, 0);
  const prodCustUniqueCustomers = new Set(flatSalesItemsForProdCust.map(i => normalize(i.customerName))).size;
  const prodCustUniqueProducts = new Set(flatSalesItemsForProdCust.map(i => normalizeProductName(i.productName))).size;
  const prodCustUniqueOrders = new Set(flatSalesItemsForProdCust.map(i => i.saleId)).size;

  // Grouping 1: By Product (showing list of customers who bought this product)
  interface ProductGroupedData {
    productName: string;
    totalQuantity: number;
    totalRevenue: number;
    avgPrice: number;
    customersCount: number;
    customers: {
      customerName: string;
      customerPhone: string;
      quantity: number;
      total: number;
      avgPrice: number;
      ordersCount: number;
      lastDate: Date | null;
      items: ProdCustItemFlat[];
    }[];
  }

  const productsGroupedMap: Record<string, ProductGroupedData> = {};
  flatSalesItemsForProdCust.forEach(item => {
    const pKey = normalizeProductName(item.productName);
    const canonicalName = getCanonicalProductName(item.productName);
    if (!productsGroupedMap[pKey]) {
      productsGroupedMap[pKey] = {
        productName: canonicalName,
        totalQuantity: 0,
        totalRevenue: 0,
        avgPrice: 0,
        customersCount: 0,
        customers: []
      };
    }
    productsGroupedMap[pKey].totalQuantity += item.quantity;
    productsGroupedMap[pKey].totalRevenue += item.total;

    const cKey = normalize(item.customerName);
    let custObj = productsGroupedMap[pKey].customers.find(c => normalize(c.customerName) === cKey);
    if (!custObj) {
      custObj = {
        customerName: item.customerName,
        customerPhone: item.customerPhone,
        quantity: 0,
        total: 0,
        avgPrice: 0,
        ordersCount: 0,
        lastDate: item.saleDate,
        items: []
      };
      productsGroupedMap[pKey].customers.push(custObj);
    }
    custObj.quantity += item.quantity;
    custObj.total += item.total;
    custObj.ordersCount += 1;
    if (item.saleDate && (!custObj.lastDate || item.saleDate > custObj.lastDate)) {
      custObj.lastDate = item.saleDate;
    }
    custObj.items.push(item);
  });

  const productsGroupedList: ProductGroupedData[] = Object.values(productsGroupedMap)
    .map(p => ({
      ...p,
      avgPrice: p.totalQuantity > 0 ? p.totalRevenue / p.totalQuantity : 0,
      customersCount: p.customers.length,
      customers: p.customers
        .map(c => ({
          ...c,
          avgPrice: c.quantity > 0 ? c.total / c.quantity : 0
        }))
        .sort((a, b) => b.total - a.total)
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  // Grouping 2: By Customer (showing list of products this customer bought)
  interface CustomerGroupedData {
    customerName: string;
    customerPhone: string;
    totalQuantity: number;
    totalRevenue: number;
    productsCount: number;
    ordersCount: number;
    products: {
      productName: string;
      quantity: number;
      total: number;
      avgPrice: number;
      ordersCount: number;
      lastDate: Date | null;
      items: ProdCustItemFlat[];
    }[];
  }

  const customersGroupedMap: Record<string, CustomerGroupedData> = {};
  flatSalesItemsForProdCust.forEach(item => {
    const cKey = normalize(item.customerName);
    if (!customersGroupedMap[cKey]) {
      customersGroupedMap[cKey] = {
        customerName: item.customerName,
        customerPhone: item.customerPhone,
        totalQuantity: 0,
        totalRevenue: 0,
        productsCount: 0,
        ordersCount: 0,
        products: []
      };
    }
    customersGroupedMap[cKey].totalQuantity += item.quantity;
    customersGroupedMap[cKey].totalRevenue += item.total;

    const pKey = normalizeProductName(item.productName);
    const canonicalName = getCanonicalProductName(item.productName);
    let prodObj = customersGroupedMap[cKey].products.find(p => normalizeProductName(p.productName) === pKey);
    if (!prodObj) {
      prodObj = {
        productName: canonicalName,
        quantity: 0,
        total: 0,
        avgPrice: 0,
        ordersCount: 0,
        lastDate: item.saleDate,
        items: []
      };
      customersGroupedMap[cKey].products.push(prodObj);
    }
    prodObj.quantity += item.quantity;
    prodObj.total += item.total;
    prodObj.ordersCount += 1;
    if (item.saleDate && (!prodObj.lastDate || item.saleDate > prodObj.lastDate)) {
      prodObj.lastDate = item.saleDate;
    }
    prodObj.items.push(item);
  });

  const customersGroupedList: CustomerGroupedData[] = Object.values(customersGroupedMap)
    .map(c => {
      const distinctOrders = new Set(c.products.flatMap(p => p.items.map(i => i.saleId))).size;
      return {
        ...c,
        ordersCount: distinctOrders,
        productsCount: c.products.length,
        products: c.products
          .map(p => ({
            ...p,
            avgPrice: p.quantity > 0 ? p.total / p.quantity : 0
          }))
          .sort((a, b) => b.total - a.total)
      };
    })
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  // Toggle row expansion
  const toggleProdCustExpand = (key: string) => {
    setProdCustExpandedKeys(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const expandAllProdCust = (expand: boolean) => {
    if (!expand) {
      setProdCustExpandedKeys({});
      return;
    }
    const newKeys: Record<string, boolean> = {};
    if (prodCustViewMode === 'product') {
      productsGroupedList.forEach(p => {
        newKeys[normalize(p.productName)] = true;
      });
    } else {
      customersGroupedList.forEach(c => {
        newKeys[normalize(c.customerName)] = true;
      });
    }
    setProdCustExpandedKeys(newKeys);
  };

  // Export CSV for Product x Customer
  const exportProdCustCSV = () => {
    if (flatSalesItemsForProdCust.length === 0) return;
    const header = "Data da Venda;Pedido / Ref;Produto;Cliente;Telefone;Quantidade;Preço Unitário (R$);Total (R$);Tipo;Status\n";
    const rows = flatSalesItemsForProdCust.map(i => {
      const dateStr = i.saleDate ? format(i.saleDate, "dd/MM/yyyy HH:mm") : 'Sem data';
      const typeStr = i.isDelivery ? 'Delivery' : 'Venda Direta';
      return `"${dateStr}";"${i.saleNumber}";"${i.productName}";"${i.customerName}";"${i.customerPhone}";${i.quantity};${i.unitPrice.toFixed(2).replace('.', ',')};${i.total.toFixed(2).replace('.', ',')};"${typeStr}";"${i.status}"`;
    }).join('\n');

    const csvContent = "\uFEFF" + header + rows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_produto_x_cliente_${prodCustPreset}_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const sortedChannelDailyData = Object.values(channelDailyDataMap).sort((a, b) => a.date.localeCompare(b.date));
  const sortedChannelDailyDataDesc = Object.values(channelDailyDataMap).sort((a, b) => b.date.localeCompare(a.date));

  const pieData = [
    { name: 'Delivery', value: totalDeliveryAmt, color: '#3b82f6' },
    { name: 'Venda Normal', value: totalNormalAmt, color: '#10b981' },
    { name: 'Feira', value: totalFairAmt, color: '#f59e0b' }
  ].filter(p => p.value > 0);

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
          { id: 'sales_by_channel', label: 'Vendas por Canal', icon: BarChart3 },
          { id: 'product_by_customer', label: 'Produto x Cliente', icon: Layers },
          { id: 'customer', label: 'Vendas por Cliente', icon: User },
          { id: 'product', label: 'Vendas por Produto', icon: Package },
          { id: 'pending_deliveries', label: 'Entregas Pendentes', icon: ShoppingBag },
          { id: 'receivables', label: 'Valores a Receber', icon: DollarSign },
          { id: 'expenses', label: 'Despesas', icon: TrendingDown },
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

      {activeReport === 'sales_by_channel' && (
        <div className="space-y-6">
          {/* Header & Filter Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <BarChart3 className="text-emerald-600" size={22} />
                  Vendas por Canal e Dia
                </h3>
                <p className="text-xs text-slate-500 mt-1">Análise comparativa de faturamento entre Delivery, Vendas Normais e Feiras.</p>
              </div>

              {/* Date Filter selector */}
              <div className="flex flex-wrap items-center gap-1.5 border border-slate-100 bg-slate-50/50 p-2 rounded-xl">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider px-1">Período:</span>
                {[
                  { id: 'all', label: 'Todas' },
                  { id: 'today', label: 'Hoje' },
                  { id: 'yesterday', label: 'Ontem' },
                  { id: 'last7', label: '7 dias' },
                  { id: 'last30', label: '30 dias' },
                  { id: 'month', label: 'Este Mês' },
                  { id: 'custom', label: 'Personalizado' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setChannelFilterPreset(p.id as any)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border",
                      channelFilterPreset === p.id
                        ? "bg-emerald-100 border-emerald-300 text-emerald-800 shadow-sm"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {channelFilterPreset === 'custom' && (
              <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 max-w-sm">
                <div>
                  <label className="block text-[9px] font-black uppercase text-slate-400 mb-1">Início</label>
                  <input
                    type="date"
                    value={channelDateStart}
                    onChange={(e) => setChannelDateStart(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-36"
                  />
                </div>
                <span className="text-slate-300 font-bold self-end mb-1">-</span>
                <div>
                  <label className="block text-[9px] font-black uppercase text-slate-400 mb-1">Fim</label>
                  <input
                    type="date"
                    value={channelDateEnd}
                    onChange={(e) => setChannelDateEnd(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-36"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Cards Resumo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Faturamento Geral</span>
                <h4 className="text-2xl font-black text-slate-800 mt-1 font-mono">
                  R$ {totalOverallAmt.toFixed(2)}
                </h4>
              </div>
              <p className="text-[10px] text-slate-500 mt-3 font-semibold">
                Soma de todos os canais de venda no período
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest block flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                  Delivery
                </span>
                <h4 className="text-2xl font-black text-slate-800 mt-1 font-mono">
                  R$ {totalDeliveryAmt.toFixed(2)}
                </h4>
              </div>
              <div className="flex justify-between items-center mt-3 text-[10px] font-bold text-slate-500">
                <span>{totalDeliveryCount} pedidos</span>
                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md">
                  {totalOverallAmt > 0 ? ((totalDeliveryAmt / totalOverallAmt) * 100).toFixed(1) : 0}%
                </span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest block flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  Venda Normal
                </span>
                <h4 className="text-2xl font-black text-slate-800 mt-1 font-mono">
                  R$ {totalNormalAmt.toFixed(2)}
                </h4>
              </div>
              <div className="flex justify-between items-center mt-3 text-[10px] font-bold text-slate-500">
                <span>{totalNormalCount} vendas</span>
                <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md">
                  {totalOverallAmt > 0 ? ((totalNormalAmt / totalOverallAmt) * 100).toFixed(1) : 0}%
                </span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest block flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                  Feira
                </span>
                <h4 className="text-2xl font-black text-slate-800 mt-1 font-mono">
                  R$ {totalFairAmt.toFixed(2)}
                </h4>
              </div>
              <div className="flex justify-between items-center mt-3 text-[10px] font-bold text-slate-500">
                <span>{totalFairCount} feiras fechadas</span>
                <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md">
                  {totalOverallAmt > 0 ? ((totalFairAmt / totalOverallAmt) * 100).toFixed(1) : 0}%
                </span>
              </div>
            </div>
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Gráfico de Barras Empilhadas */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 lg:col-span-2 space-y-4">
              <div>
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Histórico de Faturamento por Dia</h4>
                <p className="text-[10px] text-slate-500">Visualização diária das vendas por modalidade.</p>
              </div>
              <div className="h-[300px] w-full">
                {sortedChannelDailyData.length === 0 ? (
                  <div className="h-full w-full flex flex-col items-center justify-center text-slate-400 gap-2">
                    <BarChart3 size={40} className="stroke-1 opacity-50" />
                    <span className="text-xs font-semibold">Nenhuma venda registrada no período selecionado</span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sortedChannelDailyData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="formattedDate" stroke="#94a3b8" fontSize={10} fontWeight="bold" tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={10} fontWeight="bold" tickLine={false} tickFormatter={(val) => `R$${val}`} />
                      <Tooltip 
                        formatter={(value: any) => [`R$ ${Number(value).toFixed(2)}`]}
                        contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', fontFamily: 'sans-serif', fontSize: '11px' }}
                      />
                      <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                      <Bar dataKey="normalAmt" name="Venda Normal" stackId="a" fill="#10b981" />
                      <Bar dataKey="deliveryAmt" name="Delivery" stackId="a" fill="#3b82f6" />
                      <Bar dataKey="fairAmt" name="Feira" stackId="a" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Pizza de Distribuição */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between space-y-4">
              <div>
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Participação por Canal</h4>
                <p className="text-[10px] text-slate-500">Proporção das receitas totais de cada canal.</p>
              </div>
              <div className="h-[220px] w-full flex items-center justify-center relative font-sans">
                {pieData.length === 0 ? (
                  <div className="text-slate-400 text-xs font-semibold">Sem dados</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: any) => [`R$ ${Number(value).toFixed(2)}`]}
                        contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', fontFamily: 'sans-serif', fontSize: '11px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                {totalOverallAmt > 0 && (
                  <div className="absolute text-center flex flex-col items-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block leading-none mb-1">Total</span>
                    <span className="text-sm font-black text-slate-800 font-mono leading-none">R$ {totalOverallAmt.toFixed(0)}</span>
                  </div>
                )}
              </div>
              <div className="space-y-1.5 pt-2 font-sans">
                {pieData.map((d, i) => (
                  <div key={i} className="flex justify-between items-center text-xs font-bold border-b border-slate-50 pb-1.5 last:border-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="text-slate-600">{d.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-800 font-mono">R$ {d.value.toFixed(2)}</span>
                      <span className="text-[10px] text-slate-400 font-normal font-sans">
                        ({((d.value / totalOverallAmt) * 100).toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tabela Detalhada por Dia */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 md:p-5 border-b border-slate-100 bg-slate-50/50">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Detalhamento Diário</h4>
              <p className="text-[10px] text-slate-500 mt-0.5">Visão tabular consolidada por data.</p>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-sans">
                    <th className="px-6 py-3.5">Dia</th>
                    <th className="px-6 py-3.5 text-center">Venda Normal</th>
                    <th className="px-6 py-3.5 text-center">Delivery</th>
                    <th className="px-6 py-3.5 text-center">Feira</th>
                    <th className="px-6 py-3.5 text-right">Total do Dia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs bg-white">
                  {sortedChannelDailyDataDesc.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-10 text-center font-bold text-slate-400">
                        Nenhuma venda encontrada no intervalo selecionado.
                      </td>
                    </tr>
                  ) : (
                    sortedChannelDailyDataDesc.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors font-sans">
                        <td className="px-6 py-3.5 font-bold text-slate-800 font-mono">
                          {row.formattedDate}
                        </td>
                        <td className="px-6 py-3.5 text-center">
                          {row.normalAmt > 0 ? (
                            <div className="flex flex-col">
                              <span className="font-black text-emerald-600 font-mono">R$ {row.normalAmt.toFixed(2)}</span>
                              <span className="text-[10px] text-slate-400 font-medium">{row.normalCount} {row.normalCount === 1 ? 'venda' : 'vendas'}</span>
                            </div>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-center">
                          {row.deliveryAmt > 0 ? (
                            <div className="flex flex-col">
                              <span className="font-black text-blue-600 font-mono">R$ {row.deliveryAmt.toFixed(2)}</span>
                              <span className="text-[10px] text-slate-400 font-medium">{row.deliveryCount} {row.deliveryCount === 1 ? 'pedido' : 'pedidos'}</span>
                            </div>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-center">
                          {row.fairAmt > 0 ? (
                            <div className="flex flex-col">
                              <span className="font-black text-amber-600 font-mono">R$ {row.fairAmt.toFixed(2)}</span>
                              <span className="text-[10px] text-slate-400 font-medium">{row.fairCount} {row.fairCount === 1 ? 'feira' : 'feiras'}</span>
                            </div>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-right font-black text-slate-900 bg-slate-50/30 font-mono text-sm">
                          R$ {row.totalAmt.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {sortedChannelDailyDataDesc.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50 font-black text-slate-700 text-xs border-t border-slate-200">
                      <td className="px-6 py-4">Total Consolidado</td>
                      <td className="px-6 py-4 text-center text-emerald-700 font-mono">
                        R$ {totalNormalAmt.toFixed(2)}
                        <span className="block text-[10px] font-bold text-slate-400 font-sans mt-0.5">({totalNormalCount} {totalNormalCount === 1 ? 'venda' : 'vendas'})</span>
                      </td>
                      <td className="px-6 py-4 text-center text-blue-700 font-mono">
                        R$ {totalDeliveryAmt.toFixed(2)}
                        <span className="block text-[10px] font-bold text-slate-400 font-sans mt-0.5">({totalDeliveryCount} {totalDeliveryCount === 1 ? 'pedido' : 'pedidos'})</span>
                      </td>
                      <td className="px-6 py-4 text-center text-amber-700 font-mono">
                        R$ {totalFairAmt.toFixed(2)}
                        <span className="block text-[10px] font-bold text-slate-400 font-sans mt-0.5">({totalFairCount} {totalFairCount === 1 ? 'feira' : 'feiras'})</span>
                      </td>
                      <td className="px-6 py-4 text-right text-slate-900 bg-slate-100/50 font-mono text-sm font-black">
                        R$ {totalOverallAmt.toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
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
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
          <div className="p-4 md:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-1.5 leading-none">
                <Package className="text-emerald-600" size={18} />
                Vendas por Produto
              </h3>
              <p className="text-[11px] text-slate-500 mt-1 font-medium">Ranking de produtos mais vendidos.</p>
            </div>
          </div>

          <div className="px-4 md:px-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-slate-100 bg-white rounded-xl p-3">
              <div className="flex flex-wrap items-center gap-1 md:gap-1.5">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider mr-1">Filtrar Período:</span>
                {[
                  { id: 'all', label: 'Todas' },
                  { id: 'today', label: 'Hoje' },
                  { id: 'yesterday', label: 'Ontem' },
                  { id: 'last7', label: '7 dias' },
                  { id: 'last30', label: '30 dias' },
                  { id: 'custom', label: 'Personalizado' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setProductFilterPreset(p.id as any)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border",
                      productFilterPreset === p.id
                        ? "bg-emerald-100 border-emerald-300 text-emerald-800 shadow-sm"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {productFilterPreset === 'custom' && (
                <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200 shrink-0 self-start sm:self-auto">
                  <input
                    type="date"
                    value={productDateStart}
                    onChange={(e) => setProductDateStart(e.target.value)}
                    className="bg-transparent text-[10px] font-bold text-slate-700 focus:outline-none border-0 p-0 pl-1 w-24"
                    title="Início"
                  />
                  <span className="text-slate-300 text-[10px] px-0.5">-</span>
                  <input
                    type="date"
                    value={productDateEnd}
                    onChange={(e) => setProductDateEnd(e.target.value)}
                    className="bg-transparent text-[10px] font-bold text-slate-700 focus:outline-none border-0 p-0 pl-1 w-24"
                    title="Fim"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 px-4 md:px-5">
            <div className="border border-slate-100 bg-slate-50/50 p-2.5 rounded-xl">
              <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Total de Itens Vendidos</p>
              <h4 className="text-lg font-black text-slate-800 mt-0.5 font-mono">
                {salesByProduct.reduce((acc, p) => acc + p.quantity, 0)}
              </h4>
            </div>
            <div className="border border-slate-100 bg-slate-50/50 p-2.5 rounded-xl">
              <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Faturamento Total em Vendas</p>
              <h4 className="text-lg font-black text-emerald-700 mt-0.5 font-mono">
                R$ {salesByProduct.reduce((acc, p) => acc + p.total, 0).toFixed(2)}
              </h4>
            </div>
            <div className="border border-slate-100 bg-slate-50/50 p-2.5 rounded-xl col-span-2 md:col-span-1">
              <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Variedade de Produtos</p>
              <h4 className="text-lg font-black text-blue-700 mt-0.5 font-mono">
                {salesByProduct.length} {salesByProduct.length === 1 ? 'produto' : 'produtos'}
              </h4>
            </div>
          </div>

          <div className="overflow-x-auto px-4 md:px-5 pb-5">
            <table className="w-full text-left border-collapse border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest w-[10%] text-center">Posição</th>
                  <th className="px-6 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest w-[45%]">Produto</th>
                  <th className="px-6 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest w-[20%] text-center">Quantidade Vendida</th>
                  <th className="px-6 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-widest w-[25%] text-right">Total em Vendas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm bg-white">
                {salesByProduct.map((p, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3.5 text-center font-mono font-bold text-slate-400">#{i + 1}</td>
                    <td className="px-6 py-3.5 font-black text-slate-900">{p.name}</td>
                    <td className="px-6 py-3.5 text-center font-mono font-bold text-slate-700 bg-slate-50/30">{p.quantity}</td>
                    <td className="px-6 py-3.5 text-right font-black text-emerald-600 font-mono">R$ {p.total.toFixed(2)}</td>
                  </tr>
                ))}
                {salesByProduct.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">
                      Nenhuma venda registrada para este período filtrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeReport === 'product_by_customer' && (
        <div className="space-y-6">
          {/* Header & Main Controls Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Layers className="text-emerald-600" size={22} />
                  Relatório: Produto Vendido x Cliente
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Cruzamento minucioso de produtos comercializados por cliente com múltiplos modos de visualização e filtros por intervalo de datas.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={exportProdCustCSV}
                  disabled={flatSalesItemsForProdCust.length === 0}
                  className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-bold transition-all"
                  title="Exportar dados filtrados em formato CSV"
                >
                  <Download size={14} />
                  Exportar CSV ({flatSalesItemsForProdCust.length})
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-emerald-200"
                >
                  <Printer size={14} />
                  Imprimir PDF
                </button>
              </div>
            </div>

            {/* Filter Section */}
            <div className="space-y-4">
              {/* Presets and Custom Dates */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider mr-1">Período:</span>
                  {[
                    { id: 'all', label: 'Todas' },
                    { id: 'today', label: 'Hoje' },
                    { id: 'yesterday', label: 'Ontem' },
                    { id: 'last7', label: '7 Dias' },
                    { id: 'last30', label: '30 Dias' },
                    { id: 'month', label: 'Este Mês' },
                    { id: 'custom', label: 'Personalizado' },
                  ].map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => setProdCustPreset(preset.id as any)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                        prodCustPreset === preset.id
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Custom Date Pickers */}
                {prodCustPreset === 'custom' && (
                  <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">De:</span>
                      <input
                        type="date"
                        value={prodCustDateStart}
                        onChange={(e) => setProdCustDateStart(e.target.value)}
                        className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Até:</span>
                      <input
                        type="date"
                        value={prodCustDateEnd}
                        onChange={(e) => setProdCustDateEnd(e.target.value)}
                        className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Dropdowns and Search */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2">
                {/* Select Product */}
                <div className="md:col-span-4 flex flex-col gap-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    Filtrar por Produto
                  </label>
                  <select
                    value={prodCustSelectedProduct}
                    onChange={(e) => setProdCustSelectedProduct(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500/20 focus:border-emerald-500 h-[38px] cursor-pointer"
                  >
                    <option value="all">Todos os Produtos ({allProductOptions.length})</option>
                    {allProductOptions.map(pName => (
                      <option key={pName} value={pName}>{pName}</option>
                    ))}
                  </select>
                </div>

                {/* Select Customer */}
                <div className="md:col-span-4 flex flex-col gap-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    Filtrar por Cliente
                  </label>
                  <select
                    value={prodCustSelectedCustomer}
                    onChange={(e) => setProdCustSelectedCustomer(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500/20 focus:border-emerald-500 h-[38px] cursor-pointer"
                  >
                    <option value="all">Todos os Clientes ({allCustomerOptions.length})</option>
                    {allCustomerOptions.map(cName => (
                      <option key={cName} value={cName}>{cName}</option>
                    ))}
                  </select>
                </div>

                {/* Search Bar */}
                <div className="md:col-span-4 flex flex-col gap-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    Buscar Geral
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
                    <input
                      type="text"
                      placeholder="Produto, cliente, pedido ou telefone..."
                      value={prodCustSearchQuery}
                      onChange={(e) => setProdCustSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500/20 focus:border-emerald-500 h-[38px]"
                    />
                    {prodCustSearchQuery && (
                      <button
                        onClick={() => setProdCustSearchQuery('')}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs font-bold"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* View Mode Switcher */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                  <button
                    onClick={() => setProdCustViewMode('product')}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                      prodCustViewMode === 'product'
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    <Package size={14} className="text-emerald-600" />
                    Agrupar por Produto
                  </button>
                  <button
                    onClick={() => setProdCustViewMode('customer')}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                      prodCustViewMode === 'customer'
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    <User size={14} className="text-indigo-600" />
                    Agrupar por Cliente
                  </button>
                  <button
                    onClick={() => setProdCustViewMode('detailed')}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                      prodCustViewMode === 'detailed'
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    <ClipboardList size={14} className="text-amber-600" />
                    Lista Detalhada ({flatSalesItemsForProdCust.length})
                  </button>
                </div>

                {prodCustViewMode !== 'detailed' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => expandAllProdCust(true)}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 px-2.5 py-1 bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                    >
                      + Expandir Todos
                    </button>
                    <button
                      onClick={() => expandAllProdCust(false)}
                      className="text-[11px] font-bold text-slate-600 hover:text-slate-800 px-2.5 py-1 bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    >
                      - Recolher Todos
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* KPI Dashboard */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                <DollarSign size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Faturamento</p>
                <h4 className="text-lg font-black text-emerald-700 mt-0.5 font-mono">
                  R$ {prodCustTotalRevenue.toFixed(2)}
                </h4>
                <p className="text-[9px] text-slate-400 mt-0.5">Total no período</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-3">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                <Package size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Volume Vendido</p>
                <h4 className="text-lg font-black text-slate-900 mt-0.5 font-mono">
                  {prodCustTotalQuantity} <span className="text-xs font-normal text-slate-500">itens</span>
                </h4>
                <p className="text-[9px] text-slate-400 mt-0.5">Soma de unidades</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-3">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                <Users size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Clientes</p>
                <h4 className="text-lg font-black text-slate-900 mt-0.5 font-mono">
                  {prodCustUniqueCustomers}
                </h4>
                <p className="text-[9px] text-slate-400 mt-0.5">Clientes compradores</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-3">
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                <Tag size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Variedade</p>
                <h4 className="text-lg font-black text-slate-900 mt-0.5 font-mono">
                  {prodCustUniqueProducts}
                </h4>
                <p className="text-[9px] text-slate-400 mt-0.5">Produtos distintos</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-3">
              <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
                <ShoppingBag size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Pedidos / Vendas</p>
                <h4 className="text-lg font-black text-slate-900 mt-0.5 font-mono">
                  {prodCustUniqueOrders}
                </h4>
                <p className="text-[9px] text-slate-400 mt-0.5">
                  Ticket Médio: R$ {(prodCustTotalRevenue / (prodCustUniqueOrders || 1)).toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* MAIN DATA TABLES BASED ON VIEW MODE */}

          {/* MODE 1: GROUPED BY PRODUCT */}
          {prodCustViewMode === 'product' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
              <div className="p-4 md:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <Package className="text-emerald-600" size={16} />
                    Produtos Comercializados e seus Compradores ({productsGroupedList.length})
                  </h4>
                  <p className="text-[11px] text-slate-500">Clique na linha do produto para ver o detalhamento de clientes que compraram.</p>
                </div>
              </div>

              <div className="overflow-x-auto px-4 md:px-5 pb-5">
                <table className="w-full text-left border-collapse border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest w-[40px] text-center"></th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest">Produto</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Qtd. Vendida</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Preço Médio</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Clientes</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Faturamento Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm bg-white">
                    {productsGroupedList.map((prod, idx) => {
                      const isExpanded = !!prodCustExpandedKeys[normalize(prod.productName)];
                      return (
                        <React.Fragment key={idx}>
                          <tr
                            onClick={() => toggleProdCustExpand(normalize(prod.productName))}
                            className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                          >
                            <td className="px-4 py-3.5 text-center text-slate-400">
                              {isExpanded ? (
                                <ChevronDown size={18} className="text-emerald-600 inline transition-transform" />
                              ) : (
                                <ChevronRight size={18} className="text-slate-400 group-hover:text-slate-600 inline transition-transform" />
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              <span className="font-black text-slate-900 group-hover:text-emerald-700 transition-colors">
                                {prod.productName}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-center font-mono font-bold text-slate-700 bg-slate-50/40">
                              {prod.totalQuantity} un
                            </td>
                            <td className="px-4 py-3.5 text-center font-mono font-bold text-slate-600">
                              R$ {prod.avgPrice.toFixed(2)}
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700">
                                {prod.customersCount} cliente{prod.customersCount !== 1 ? 's' : ''}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right font-black text-emerald-600 font-mono text-base">
                              R$ {prod.totalRevenue.toFixed(2)}
                            </td>
                          </tr>

                          {/* Expanded Nested Subtable */}
                          {isExpanded && (
                            <tr className="bg-slate-50/80">
                              <td colSpan={6} className="p-3 md:p-5">
                                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
                                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                    <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                      <Users size={14} className="text-indigo-600" />
                                      Clientes que compraram {prod.productName} ({prod.customers.length})
                                    </span>
                                    <span className="text-xs font-mono font-bold text-slate-500">
                                      {prod.totalQuantity} unidades • R$ {prod.totalRevenue.toFixed(2)}
                                    </span>
                                  </div>

                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                      <thead>
                                        <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase">
                                          <th className="py-2 px-3">Cliente</th>
                                          <th className="py-2 px-3">Contato</th>
                                          <th className="py-2 px-3 text-center">Qtd. Comprada</th>
                                          <th className="py-2 px-3 text-center">Preço Médio</th>
                                          <th className="py-2 px-3 text-right">Total Gasto</th>
                                          <th className="py-2 px-3 text-center">Nº Compras</th>
                                          <th className="py-2 px-3 text-right">Última Compra</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {prod.customers.map((c, cIdx) => (
                                          <tr key={cIdx} className="hover:bg-slate-50/60">
                                            <td className="py-2.5 px-3 font-bold text-slate-800">
                                              {c.customerName}
                                            </td>
                                            <td className="py-2.5 px-3 text-slate-500 font-mono">
                                              {c.customerPhone || '—'}
                                            </td>
                                            <td className="py-2.5 px-3 text-center font-bold text-slate-700 font-mono">
                                              {c.quantity} un
                                            </td>
                                            <td className="py-2.5 px-3 text-center text-slate-600 font-mono">
                                              R$ {c.avgPrice.toFixed(2)}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-black text-emerald-600 font-mono">
                                              R$ {c.total.toFixed(2)}
                                            </td>
                                            <td className="py-2.5 px-3 text-center text-slate-500">
                                              {c.ordersCount}x
                                            </td>
                                            <td className="py-2.5 px-3 text-right text-slate-500 font-mono">
                                              {c.lastDate ? format(c.lastDate, "dd/MM/yyyy") : '—'}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {productsGroupedList.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                          Nenhum produto encontrado com os filtros selecionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* MODE 2: GROUPED BY CUSTOMER */}
          {prodCustViewMode === 'customer' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
              <div className="p-4 md:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <User className="text-indigo-600" size={16} />
                    Clientes e os Produtos Adquiridos ({customersGroupedList.length})
                  </h4>
                  <p className="text-[11px] text-slate-500">Clique no cliente para ver a lista de produtos comprados por ele.</p>
                </div>
              </div>

              <div className="overflow-x-auto px-4 md:px-5 pb-5">
                <table className="w-full text-left border-collapse border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest w-[40px] text-center"></th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest">Cliente / Contato</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Total de Itens</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Variedade</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Pedidos</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Faturamento Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm bg-white">
                    {customersGroupedList.map((cust, idx) => {
                      const isExpanded = !!prodCustExpandedKeys[normalize(cust.customerName)];
                      return (
                        <React.Fragment key={idx}>
                          <tr
                            onClick={() => toggleProdCustExpand(normalize(cust.customerName))}
                            className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                          >
                            <td className="px-4 py-3.5 text-center text-slate-400">
                              {isExpanded ? (
                                <ChevronDown size={18} className="text-indigo-600 inline transition-transform" />
                              ) : (
                                <ChevronRight size={18} className="text-slate-400 group-hover:text-slate-600 inline transition-transform" />
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="font-black text-slate-900 group-hover:text-indigo-700 transition-colors">
                                {cust.customerName}
                              </div>
                              {cust.customerPhone && (
                                <div className="text-[11px] text-slate-400 font-mono">
                                  {cust.customerPhone}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-center font-mono font-bold text-slate-700 bg-slate-50/40">
                              {cust.totalQuantity} un
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700">
                                {cust.productsCount} produto{cust.productsCount !== 1 ? 's' : ''}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-center text-slate-600 font-bold font-mono">
                              {cust.ordersCount}x
                            </td>
                            <td className="px-4 py-3.5 text-right font-black text-emerald-600 font-mono text-base">
                              R$ {cust.totalRevenue.toFixed(2)}
                            </td>
                          </tr>

                          {/* Expanded Nested Subtable */}
                          {isExpanded && (
                            <tr className="bg-slate-50/80">
                              <td colSpan={6} className="p-3 md:p-5">
                                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
                                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                    <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                      <Package size={14} className="text-emerald-600" />
                                      Produtos comprados por {cust.customerName} ({cust.products.length})
                                    </span>
                                    <span className="text-xs font-mono font-bold text-slate-500">
                                      {cust.totalQuantity} itens • Total: R$ {cust.totalRevenue.toFixed(2)}
                                    </span>
                                  </div>

                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                      <thead>
                                        <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase">
                                          <th className="py-2 px-3">Produto</th>
                                          <th className="py-2 px-3 text-center">Qtd. Comprada</th>
                                          <th className="py-2 px-3 text-center">Preço Médio</th>
                                          <th className="py-2 px-3 text-right">Total Gasto</th>
                                          <th className="py-2 px-3 text-center">Vezes Comprado</th>
                                          <th className="py-2 px-3 text-right">Última Compra</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {cust.products.map((p, pIdx) => (
                                          <tr key={pIdx} className="hover:bg-slate-50/60">
                                            <td className="py-2.5 px-3 font-bold text-slate-800">
                                              {p.productName}
                                            </td>
                                            <td className="py-2.5 px-3 text-center font-bold text-slate-700 font-mono">
                                              {p.quantity} un
                                            </td>
                                            <td className="py-2.5 px-3 text-center text-slate-600 font-mono">
                                              R$ {p.avgPrice.toFixed(2)}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-black text-emerald-600 font-mono">
                                              R$ {p.total.toFixed(2)}
                                            </td>
                                            <td className="py-2.5 px-3 text-center text-slate-500">
                                              {p.ordersCount}x
                                            </td>
                                            <td className="py-2.5 px-3 text-right text-slate-500 font-mono">
                                              {p.lastDate ? format(p.lastDate, "dd/MM/yyyy") : '—'}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {customersGroupedList.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                          Nenhum cliente encontrado com os filtros selecionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* MODE 3: DETAILED FLAT TABLE */}
          {prodCustViewMode === 'detailed' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
              <div className="p-4 md:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <ClipboardList className="text-amber-600" size={16} />
                    Histórico Detalhado Item a Item ({flatSalesItemsForProdCust.length} lançamentos)
                  </h4>
                  <p className="text-[11px] text-slate-500">Listagem individual de todos os produtos vendidos com referência ao pedido original.</p>
                </div>
              </div>

              <div className="overflow-x-auto px-4 md:px-5 pb-5">
                <table className="w-full text-left border-collapse border border-slate-200 rounded-xl overflow-hidden shadow-sm text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-3.5 py-3 font-bold text-slate-400 uppercase tracking-widest">Data</th>
                      <th className="px-3.5 py-3 font-bold text-slate-400 uppercase tracking-widest">Pedido</th>
                      <th className="px-3.5 py-3 font-bold text-slate-400 uppercase tracking-widest">Produto</th>
                      <th className="px-3.5 py-3 font-bold text-slate-400 uppercase tracking-widest">Cliente</th>
                      <th className="px-3.5 py-3 font-bold text-slate-400 uppercase tracking-widest text-center">Qtd</th>
                      <th className="px-3.5 py-3 font-bold text-slate-400 uppercase tracking-widest text-center">Preço Unit.</th>
                      <th className="px-3.5 py-3 font-bold text-slate-400 uppercase tracking-widest text-right">Total</th>
                      <th className="px-3.5 py-3 font-bold text-slate-400 uppercase tracking-widest text-center">Canal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {flatSalesItemsForProdCust.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-3.5 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                          {item.saleDate ? format(item.saleDate, "dd/MM/yy HH:mm") : '—'}
                        </td>
                        <td className="px-3.5 py-2.5 font-mono font-bold text-slate-700">
                          {item.saleNumber}
                        </td>
                        <td className="px-3.5 py-2.5 font-bold text-slate-900">
                          {item.productName}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <div className="font-bold text-slate-800">{item.customerName}</div>
                          {item.customerPhone && (
                            <div className="text-[10px] text-slate-400 font-mono">{item.customerPhone}</div>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-bold font-mono text-slate-700 bg-slate-50/40">
                          {item.quantity}
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-mono text-slate-600">
                          R$ {item.unitPrice.toFixed(2)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-black text-emerald-600 font-mono">
                          R$ {item.total.toFixed(2)}
                        </td>
                        <td className="px-3.5 py-2.5 text-center">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-bold",
                            item.isDelivery ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"
                          )}>
                            {item.isDelivery ? 'Delivery' : 'Direta'}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {flatSalesItemsForProdCust.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-slate-400 italic">
                          Nenhum lançamento de produto encontrado no período.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
                    <tr key={s.id} className="hover:bg-slate-50/30 transition-colors border-b border-slate-100">
                      <td className="py-4 px-3 align-middle">
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
                      <td className="py-4 px-3 font-medium text-slate-500 whitespace-nowrap align-middle">
                        {dDate ? (
                          <div className="flex items-center gap-1 font-bold text-slate-700 text-[10px] bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded w-max">
                            <Calendar size={10} className="text-amber-500 shrink-0" />
                            {safeFormatDate(s.deliveryDate, "dd/MM/yyyy")}
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Não agendado</span>
                        )}
                      </td>
                      <td className="py-4 px-3 max-w-xs truncate text-slate-600 font-medium text-[11px] align-middle" title={s.deliveryAddress}>
                        {s.deliveryAddress || <span className="text-slate-400 italic text-[10px]">Retirada Local</span>}
                      </td>
                      <td className="py-4 px-3 align-middle">
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
                      <td className="py-4 px-3 text-right font-black text-slate-900 text-xs whitespace-nowrap align-middle">
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

      {activeReport === 'expenses' && (
        <div className="space-y-6">
          {/* Header & Controls */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-100">
              <div>
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <TrendingDown className="text-rose-600" size={24} />
                  Relatório de Despesas
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Análise de fluxo de despesas com filtros customizados de período.
                </p>
              </div>

              {/* PDF Print Button */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer"
                >
                  <Printer size={15} />
                  Imprimir Despesas
                </button>
              </div>
            </div>

            {/* Filter controls row */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-6">
              {/* Preset Buttons */}
              <div className="md:col-span-4 flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  Período do Relatório
                </label>
                <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200">
                  {[
                    { id: 'week', label: 'Esta Semana' },
                    { id: 'month', label: 'Este Mês' },
                    { id: 'custom', label: 'Personalizado' },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => setExpenseFilterPreset(preset.id as any)}
                      className={cn(
                        "flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer text-center",
                        expenseFilterPreset === preset.id
                          ? "bg-white text-slate-900 shadow-xs border border-slate-200/50"
                          : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Date Inputs */}
              {expenseFilterPreset === 'custom' && (
                <div className="md:col-span-4 flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    Intervalo Personalizado
                  </label>
                  <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                    <input
                      type="date"
                      value={expenseDateStart}
                      onChange={(e) => setExpenseDateStart(e.target.value)}
                      className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none border-0 p-0 pl-1 w-full"
                    />
                    <span className="text-slate-300 text-xs px-1">Até</span>
                    <input
                      type="date"
                      value={expenseDateEnd}
                      onChange={(e) => setExpenseDateEnd(e.target.value)}
                      className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none border-0 p-0 pl-1 w-full"
                    />
                  </div>
                </div>
              )}

              {/* Category Dropdown */}
              <div className={cn(
                "flex flex-col gap-1.5",
                expenseFilterPreset === 'custom' ? "md:col-span-2" : "md:col-span-4"
              )}>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  Filtrar Categoria
                </label>
                <select
                  value={expenseSelectedCategory}
                  onChange={(e) => setExpenseSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-500/20 focus:border-rose-500 h-[38px] cursor-pointer"
                >
                  <option value="all">Todas as Categorias</option>
                  {expenseCategoriesList.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Search input */}
              <div className="md:col-span-4 flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  Buscar por Palavra-chave
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="Buscar em descrição ou categoria..."
                    value={expenseSearchQuery}
                    onChange={(e) => setExpenseSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-500/20 focus:border-rose-500 h-[38px]"
                  />
                  {expenseSearchQuery && (
                    <button
                      onClick={() => setExpenseSearchQuery('')}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      X
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* KPI Dashboard */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Expense KPI */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
                <TrendingDown size={22} />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total de Despesas</p>
                <h4 className="text-xl font-black text-slate-900 mt-1 font-mono">
                  R$ {totalExpenseFiltered.toFixed(2)}
                </h4>
                <p className="text-[9px] text-slate-400 mt-0.5">
                  {filteredExpenses.length} lançamentos efetuados
                </p>
              </div>
            </div>

            {/* Daily Average KPI */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                <Clock size={22} />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Média Diária</p>
                <h4 className="text-xl font-black text-slate-900 mt-1 font-mono">
                  R$ {expenseDailyAvg.toFixed(2)}
                </h4>
                <p className="text-[9px] text-slate-400 mt-0.5">
                  Distribuído em {expenseDiffDays} dias
                </p>
              </div>
            </div>

            {/* Top Category KPI */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                <Tag size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Maior Categoria</p>
                <h4 className="text-base font-black text-slate-900 mt-1 truncate" title={topExpenseCategoryFiltered.name}>
                  {topExpenseCategoryFiltered.name}
                </h4>
                <p className="text-[9px] text-indigo-600 font-extrabold mt-0.5 font-mono">
                  R$ {((topExpenseCategoryFiltered.value) as number).toFixed(2)}
                </p>
              </div>
            </div>

            {/* Highest Expense KPI */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                <DollarSign size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Maior Despesa Única</p>
                <h4 className="text-base font-black text-slate-900 mt-1 truncate" title={maxExpenseFilteredItem?.description}>
                  {maxExpenseFilteredItem?.description || 'Nenhuma'}
                </h4>
                <p className="text-[9px] text-blue-600 font-extrabold mt-0.5 font-mono">
                  R$ {maxExpenseFiltered.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Charts section */}
          {filteredExpenses.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Evolution Chart */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h4 className="text-sm font-black text-slate-900 mb-4 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity size={16} className="text-rose-600" />
                  Evolução das Despesas (Linha do Tempo)
                </h4>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={expenseTimelineSorted}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        formatter={(val) => [`R$ ${Number(val).toFixed(2)}`, 'Despesa']}
                      />
                      <Bar dataKey="amount" name="Despesa" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Share Pie Chart */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                <h4 className="text-sm font-black text-slate-900 mb-4 uppercase tracking-wider flex items-center gap-1.5">
                  <PieChartIcon size={16} className="text-indigo-600" />
                  Divisão por Categoria
                </h4>
                <div className="h-64 w-full flex items-center justify-center relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expenseCategoryChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {expenseCategoryChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        formatter={(val) => `R$ ${Number(val).toFixed(2)}`}
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-150 p-12 text-center rounded-2xl">
              <p className="text-slate-400 text-sm font-semibold italic">Sem dados suficientes de despesas para gerar gráficos.</p>
            </div>
          )}

          {/* Details Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider">Lançamentos de Despesas</h4>
                <p className="text-xs text-slate-500 mt-0.5">Lista discriminada das despesas correspondentes aos filtros aplicados.</p>
              </div>

              {/* CSV Export Button */}
              {filteredExpenses.length > 0 && (
                <button
                  onClick={() => {
                    const headers = 'Data,Descrição,Categoria,Valor (R$)\n';
                    const rows = sortedExpensesTable.map(t => {
                      const dStr = format(parseFirebaseDate(t.date) || new Date(), 'dd/MM/yyyy');
                      const desc = `"${t.description.replace(/"/g, '""')}"`;
                      const cat = `"${t.category.replace(/"/g, '""')}"`;
                      const val = t.amount.toFixed(2);
                      return `${dStr},${desc},${cat},${val}`;
                    }).join('\n');
                    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.setAttribute('href', url);
                    link.setAttribute('download', `relatorio_despesas_${expenseFilterPreset}_${format(new Date(), 'yyyyMMdd')}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl text-[10px] font-bold uppercase transition-all cursor-pointer"
                >
                  Exportar CSV
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-6">Data</th>
                    <th className="py-3 px-6">Descrição</th>
                    <th className="py-3 px-6">Categoria</th>
                    <th className="py-3 px-6 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {sortedExpensesTable.map((t) => {
                    const expDate = parseFirebaseDate(t.date);
                    return (
                      <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 px-6 font-semibold text-slate-500 whitespace-nowrap">
                          {expDate ? format(expDate, "dd/MM/yyyy") : 'Sem data'}
                        </td>
                        <td className="py-3.5 px-6 font-black text-slate-800">
                          {t.description}
                        </td>
                        <td className="py-3.5 px-6">
                          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold text-[10px]">
                            {t.category}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-right font-bold text-rose-600 font-mono">
                          R$ {t.amount.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                  {sortedExpensesTable.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-400 italic">
                        Nenhuma despesa localizada para este período e filtros selecionados.
                      </td>
                    </tr>
                  )}
                </tbody>
                {sortedExpensesTable.length > 0 && (
                  <tfoot className="bg-slate-900 text-white">
                    <tr className="font-bold text-sm">
                      <td colSpan={3} className="py-3 px-6 uppercase tracking-wider text-xs">Total Filtrado</td>
                      <td className="py-3 px-6 text-right font-black font-mono text-emerald-400">
                        R$ {totalExpenseFiltered.toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
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
        {activeReport === 'product_by_customer' ? (
          <div>
            {/* Header Impressão Produto x Cliente */}
            <div className="border-b-[3px] border-slate-950 pb-2 flex justify-between items-end">
              <div>
                <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase leading-none">
                  Relatório: Produto Vendido x Cliente
                </h1>
                <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase">
                  Consolidado de Produtos e Compradores
                </p>
              </div>
              <div className="text-right text-[10px] text-slate-600 font-medium">
                <p className="font-bold">Emissão: <span className="font-mono">{format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span></p>
                <p className="mt-0.5">
                  <b>Período:</b> {
                    prodCustPreset === 'all' ? 'Todo o Histórico' :
                    prodCustPreset === 'today' ? 'Hoje' :
                    prodCustPreset === 'yesterday' ? 'Ontem' :
                    prodCustPreset === 'last7' ? 'Últimos 7 Dias' :
                    prodCustPreset === 'last30' ? 'Últimos 30 Dias' :
                    prodCustPreset === 'month' ? 'Este Mês' :
                    `De ${prodCustDateStart ? safeFormatDate(prodCustDateStart) : 'Início'} até ${prodCustDateEnd ? safeFormatDate(prodCustDateEnd) : 'Fim'}`
                  }
                </p>
              </div>
            </div>

            {/* Resumo de Indicadores */}
            <div className="grid grid-cols-4 gap-2 text-[10px] border border-slate-300 px-4 py-2 rounded-lg bg-slate-50 my-2.5">
              <div>
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[9px]">Faturamento:</span>{' '}
                <span className="font-black text-emerald-800 text-xs font-mono">
                  R$ {prodCustTotalRevenue.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[9px]">Qtd. Itens:</span>{' '}
                <span className="font-black text-slate-800 text-xs font-mono">
                  {prodCustTotalQuantity} un
                </span>
              </div>
              <div>
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[9px]">Clientes:</span>{' '}
                <span className="font-black text-slate-800 text-xs">
                  {prodCustUniqueCustomers} compradores
                </span>
              </div>
              <div>
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[9px]">Produtos:</span>{' '}
                <span className="font-black text-slate-800 text-xs">
                  {prodCustUniqueProducts} variedades
                </span>
              </div>
            </div>

            {/* Tabela de Impressão */}
            <table className="w-full text-left border-collapse border-2 border-slate-900 text-[10px]">
              <thead>
                <tr className="bg-slate-100 font-black uppercase text-slate-700 tracking-wider border-b-2 border-slate-900">
                  <th className="py-1.5 px-2 border border-slate-400 w-[12%]">Data</th>
                  <th className="py-1.5 px-2 border border-slate-400 w-[8%] font-mono">Pedido</th>
                  <th className="py-1.5 px-2 border border-slate-400 w-[25%]">Produto</th>
                  <th className="py-1.5 px-2 border border-slate-400 w-[25%]">Cliente / Contato</th>
                  <th className="py-1.5 px-2 border border-slate-400 text-center w-[8%]">Qtd</th>
                  <th className="py-1.5 px-2 border border-slate-400 text-right w-[10%]">Preço Unit.</th>
                  <th className="py-1.5 px-2 border border-slate-400 text-right w-[12%]">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-400">
                {flatSalesItemsForProdCust.map((item) => (
                  <tr key={item.id} className="print-item-row text-slate-900 border-b border-slate-300">
                    <td className="py-1.5 px-2 border border-slate-400 font-mono">
                      {item.saleDate ? format(item.saleDate, "dd/MM/yyyy HH:mm") : '—'}
                    </td>
                    <td className="py-1.5 px-2 border border-slate-400 font-mono font-bold">
                      {item.saleNumber}
                    </td>
                    <td className="py-1.5 px-2 border border-slate-400 font-bold">
                      {item.productName}
                    </td>
                    <td className="py-1.5 px-2 border border-slate-400">
                      <div className="font-bold">{item.customerName}</div>
                      {item.customerPhone && (
                        <div className="text-[8px] text-slate-500 font-mono">{item.customerPhone}</div>
                      )}
                    </td>
                    <td className="py-1.5 px-2 border border-slate-400 text-center font-mono font-bold bg-slate-50">
                      {item.quantity}
                    </td>
                    <td className="py-1.5 px-2 border border-slate-400 text-right font-mono">
                      R$ {item.unitPrice.toFixed(2)}
                    </td>
                    <td className="py-1.5 px-2 border border-slate-400 text-right font-mono font-bold text-slate-950">
                      R$ {item.total.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {flatSalesItemsForProdCust.length === 0 && (
              <div className="text-center py-8 text-slate-400 italic font-bold border border-dashed border-slate-300 rounded-lg text-xs mt-4">
                Nenhum produto vendido encontrado para este intervalo selecionado.
              </div>
            )}
          </div>
        ) : (
          <div>
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
                    <tr key={s.id} className="print-item-row text-slate-900 border-b-2 border-slate-950">
                      {/* Número Seq/Ref do Pedido */}
                      <td className="py-6 px-3 border border-slate-400 text-center font-mono font-black bg-slate-50">
                        #{s.saleNumber || `${idx + 1}`}
                      </td>

                      {/* Cliente e Celular */}
                      <td className="py-6 px-3 border border-slate-400">
                        <div className="font-black text-slate-955 text-[11px] leading-tight">{s.customerName}</div>
                        {getCustomerPhone(s) && (
                          <div className="text-[9px] text-slate-500 font-bold mt-1 font-mono">{getCustomerPhone(s)}</div>
                        )}
                      </td>

                      {/* Previsão de Entrega */}
                      <td className="py-6 px-3 border border-slate-400 font-bold text-slate-700 whitespace-nowrap text-center">
                        {dDate ? safeFormatDate(s.deliveryDate, "dd/MM/yyyy") : <span className="text-slate-400 italic">Não agendado</span>}
                      </td>

                      {/* Endereço de Entrega */}
                      <td className="py-6 px-3 border border-slate-400 font-extrabold text-[10px] leading-snug uppercase text-slate-900">
                        {s.deliveryAddress || <span className="text-slate-500 italic lowercase font-medium">Retirada Local / Horta</span>}
                      </td>

                      {/* Itens do Pedido */}
                      <td className="py-6 px-3 border border-slate-400">
                        <div className="flex flex-wrap gap-1 font-mono text-[9px]">
                          {s.items.map((item, i) => {
                            const qty = typeof item.quantity === 'number' ? item.quantity : Number(item.quantity) || 0;
                            return (
                              <span key={i} className="bg-slate-100 border border-slate-300 text-slate-900 px-1.5 py-0.5 rounded font-bold whitespace-nowrap">
                                {qty}x {item.name}
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      {/* Observações */}
                      <td className="py-6 px-3 border border-slate-400 text-[9px] leading-tight text-slate-700 italic font-medium">
                        {s.observations?.trim() ? s.observations : "—"}
                      </td>

                      {/* Total e Forma de Cobrança */}
                      <td className="py-6 px-3 border border-slate-400 text-right font-mono whitespace-nowrap">
                        <div className="font-black text-[11px] text-slate-950">R$ {s.total.toFixed(2)}</div>
                        <div className="text-[7.5px] text-slate-500 font-extrabold font-sans uppercase tracking-tighter mt-1">{pmStr}</div>
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
        )}
      </div>
    </>
  );
}
