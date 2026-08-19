import React, { useState, useMemo } from 'react';
import { 
  Sale, 
  SaleItem, 
  ProduceCatalogItem, 
  InventoryItem, 
  Customer, 
  PaymentMethod 
} from '../types';
import { 
  Plus, 
  Search, 
  Calendar, 
  Truck, 
  Scale, 
  ShoppingCart, 
  DollarSign, 
  TrendingUp, 
  CheckCircle2, 
  Clock, 
  Copy, 
  ExternalLink, 
  Trash2, 
  Edit2, 
  ChevronDown, 
  ChevronUp, 
  Check, 
  AlertCircle, 
  Sparkles,
  ShoppingBag,
  Send,
  Printer,
  FileSpreadsheet,
  Package,
  Layers,
  ArrowRight,
  Info
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { getCanonicalProductName, normalizeProductName } from '../productUtils';
import { cn } from '../App';

interface KgSalesManagerProps {
  sales: Sale[];
  produceCatalog: ProduceCatalogItem[];
  inventory: InventoryItem[];
  customers: Customer[];
  onRefreshSales?: () => void;
}

// Lista de sugestões de produtos populares de terceiros para compra/revenda (todos em kg por padrão)
const POPULAR_THIRD_PARTY_ITEMS = [
  { name: 'Alface Americana (Revenda)', defaultCost: 6.00, defaultPrice: 12.00, unit: 'kg' },
  { name: 'Alface Crespa (Revenda)', defaultCost: 5.00, defaultPrice: 10.00, unit: 'kg' },
  { name: 'Rúcula (Revenda)', defaultCost: 7.00, defaultPrice: 14.00, unit: 'kg' },
  { name: 'Couve Manteiga (Revenda)', defaultCost: 5.00, defaultPrice: 10.00, unit: 'kg' },
  { name: 'Espinafre (Revenda)', defaultCost: 6.00, defaultPrice: 12.00, unit: 'kg' },
  { name: 'Agrião (Revenda)', defaultCost: 6.00, defaultPrice: 12.00, unit: 'kg' },
  { name: 'Repolho Verde', defaultCost: 2.50, defaultPrice: 5.00, unit: 'kg' },
  { name: 'Repolho Roxo', defaultCost: 3.50, defaultPrice: 7.00, unit: 'kg' },
  { name: 'Brócolis Ninja', defaultCost: 7.00, defaultPrice: 14.00, unit: 'kg' },
  { name: 'Couve-Flor', defaultCost: 6.00, defaultPrice: 12.00, unit: 'kg' },
  { name: 'Tomate Italiano', defaultCost: 4.50, defaultPrice: 8.50, unit: 'kg' },
  { name: 'Tomate Carmem / Longa Vida', defaultCost: 4.00, defaultPrice: 7.50, unit: 'kg' },
  { name: 'Tomate Cereja', defaultCost: 6.00, defaultPrice: 12.00, unit: 'kg' },
  { name: 'Batata Inglesa', defaultCost: 3.50, defaultPrice: 6.00, unit: 'kg' },
  { name: 'Batata Doce', defaultCost: 3.00, defaultPrice: 5.50, unit: 'kg' },
  { name: 'Cenoura Especial', defaultCost: 3.80, defaultPrice: 6.50, unit: 'kg' },
  { name: 'Beterraba', defaultCost: 3.50, defaultPrice: 6.00, unit: 'kg' },
  { name: 'Cebola Roxa', defaultCost: 4.50, defaultPrice: 7.90, unit: 'kg' },
  { name: 'Cebola Nacional', defaultCost: 3.20, defaultPrice: 5.80, unit: 'kg' },
  { name: 'Pimentão Verde', defaultCost: 4.00, defaultPrice: 7.00, unit: 'kg' },
  { name: 'Pimentão Vermelho/Amarelo', defaultCost: 8.00, defaultPrice: 15.00, unit: 'kg' },
  { name: 'Abobrinha Italiana', defaultCost: 3.20, defaultPrice: 6.00, unit: 'kg' },
  { name: 'Abobrinha Menina', defaultCost: 3.50, defaultPrice: 6.50, unit: 'kg' },
  { name: 'Chuchu', defaultCost: 2.00, defaultPrice: 4.50, unit: 'kg' },
  { name: 'Pepino Japonês', defaultCost: 3.50, defaultPrice: 6.90, unit: 'kg' },
  { name: 'Mandioca / Aipim Descascado', defaultCost: 4.00, defaultPrice: 8.00, unit: 'kg' },
  { name: 'Alho Roxo', defaultCost: 18.00, defaultPrice: 32.00, unit: 'kg' },
  { name: 'Banana Prata', defaultCost: 3.50, defaultPrice: 6.50, unit: 'kg' },
  { name: 'Banana Nanica', defaultCost: 2.80, defaultPrice: 5.50, unit: 'kg' },
  { name: 'Laranja Pera', defaultCost: 2.50, defaultPrice: 4.90, unit: 'kg' },
  { name: 'Limão Taiti', defaultCost: 3.00, defaultPrice: 6.00, unit: 'kg' },
  { name: 'Maçã Gala', defaultCost: 5.50, defaultPrice: 9.90, unit: 'kg' },
  { name: 'Mamão Formosa', defaultCost: 3.80, defaultPrice: 7.00, unit: 'kg' },
  { name: 'Melancia', defaultCost: 1.80, defaultPrice: 3.50, unit: 'kg' },
  { name: 'Melão Amarelo', defaultCost: 3.80, defaultPrice: 7.00, unit: 'kg' },
  { name: 'Ovos Caipira (Dúzia)', defaultCost: 9.00, defaultPrice: 15.00, unit: 'dz' }
];

export default function KgSalesManager({
  sales,
  produceCatalog,
  inventory,
  customers
}: KgSalesManagerProps) {
  // Filtros principais
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'tomorrow' | 'week' | 'custom'>('all');
  const [customDate, setCustomDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'needs_purchase' | 'purchased' | 'delivered' | 'paid'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modais
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [isShoppingListModalOpen, setIsShoppingListModalOpen] = useState(false);
  const [isWeighingModalOpen, setIsWeighingModalOpen] = useState(false);
  const [selectedSaleForWeighing, setSelectedSaleForWeighing] = useState<Sale | null>(null);
  const [weighingInputs, setWeighingInputs] = useState<Record<number, number>>({});
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  
  // Feedback e Loading
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [expenseSavedFeedback, setExpenseSavedFeedback] = useState(false);

  // Estados do Formulário de Pedido por KG
  const [clientPhone, setClientPhone] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientNotes, setClientNotes] = useState('');
  const [deliveryDateInput, setDeliveryDateInput] = useState(
    format(new Date(Date.now() + 86400000), 'yyyy-MM-dd')
  );
  const [orderItems, setOrderItems] = useState<SaleItem[]>([]);
  const [paymentOption, setPaymentOption] = useState('Pagar na Entrega');
  const [productOriginTab, setProductOriginTab] = useState<'own' | 'third_party'>('own');
  const [productSearch, setProductSearch] = useState('');

  // Itens customizados de terceiros digitados na hora
  const [customItemName, setCustomItemName] = useState('');
  const [customItemQty, setCustomItemQty] = useState<number | ''>('');
  const [customItemUnit, setCustomItemUnit] = useState('kg');
  const [customItemCost, setCustomItemCost] = useState<number | ''>('');
  const [customItemPrice, setCustomItemPrice] = useState<number | ''>('');
  const [customItemSupplierNotes, setCustomItemSupplierNotes] = useState('');

  // Catálogo deduplicado
  const uniqueCatalog = useMemo(() => {
    const map = new Map<string, ProduceCatalogItem>();
    produceCatalog.forEach(item => {
      const canonical = getCanonicalProductName(item.name);
      const key = normalizeProductName(canonical);
      if (!map.has(key)) {
        map.set(key, { ...item, name: canonical, unit: item.unit || 'kg' });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [produceCatalog]);

  // Lista de Vendas do Modo KG
  const kgSales = useMemo(() => {
    return sales.filter(s => s.isKgMode === true);
  }, [sales]);

  // Helper de Data do Pedido
  const getSaleDateObj = (sale: Sale): Date | null => {
    const d = sale.deliveryDate || sale.createdAt;
    if (!d) return null;
    if (typeof d.toDate === 'function') return d.toDate();
    return new Date(d);
  };

  // Filtragem dos pedidos por KG
  const filteredKgSales = useMemo(() => {
    return kgSales.filter(sale => {
      // 1. Busca textual
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const matchesClient = sale.customerName.toLowerCase().includes(q);
        const matchesPhone = (sale.customerPhone || '').includes(q);
        const matchesItems = sale.items.some(i => i.name.toLowerCase().includes(q));
        if (!matchesClient && !matchesPhone && !matchesItems) return false;
      }

      // 2. Filtro de Status
      if (statusFilter === 'needs_purchase') {
        const hasUnpurchased = sale.items.some(i => i.source === 'third_party' && !i.purchased);
        if (!hasUnpurchased || sale.status === 'paid' || sale.status === 'cancelled') return false;
      } else if (statusFilter === 'purchased') {
        const hasThird = sale.items.some(i => i.source === 'third_party');
        const allThirdPurchased = !sale.items.some(i => i.source === 'third_party' && !i.purchased);
        if (!hasThird || !allThirdPurchased || sale.status === 'paid') return false;
      } else if (statusFilter === 'delivered') {
        if (sale.status !== 'delivered' && sale.status !== 'pending_delivery') return false;
      } else if (statusFilter === 'paid') {
        if (sale.status !== 'paid' && sale.status !== 'confirmed') return false;
      }

      // 3. Filtro de Data
      if (dateFilter === 'all') return true;

      const saleDate = getSaleDateObj(sale);
      if (!saleDate) return false;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const sDay = new Date(saleDate);
      sDay.setHours(0, 0, 0, 0);

      if (dateFilter === 'today') {
        return sDay.getTime() === today.getTime();
      }
      if (dateFilter === 'tomorrow') {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return sDay.getTime() === tomorrow.getTime();
      }
      if (dateFilter === 'week') {
        const in7Days = new Date(today);
        in7Days.setDate(in7Days.getDate() + 7);
        return sDay >= today && sDay <= in7Days;
      }
      if (dateFilter === 'custom' && customDate) {
        const cDate = new Date(customDate + 'T00:00:00');
        return sDay.getTime() === cDate.getTime();
      }

      return true;
    });
  }, [kgSales, searchQuery, statusFilter, dateFilter, customDate]);

  // Métricas Consolidadas
  const metrics = useMemo(() => {
    let totalRevenue = 0;
    let totalThirdPartyCost = 0;
    let totalOwnKg = 0;
    let totalThirdPartyKg = 0;
    let pendingPurchasesCount = 0;

    filteredKgSales.forEach(sale => {
      if (sale.status === 'cancelled') return;
      totalRevenue += sale.total || 0;

      sale.items.forEach(item => {
        const qty = Number(item.quantity) || 0;
        if (item.source === 'third_party') {
          totalThirdPartyKg += qty;
          const cost = Number(item.cost || item.estimatedCost || 0);
          totalThirdPartyCost += cost * qty;
          if (!item.purchased) pendingPurchasesCount++;
        } else {
          totalOwnKg += qty;
        }
      });
    });

    const estimatedGrossProfit = totalRevenue - totalThirdPartyCost;
    const profitMargin = totalRevenue > 0 ? (estimatedGrossProfit / totalRevenue) * 100 : 0;

    return {
      totalOrders: filteredKgSales.length,
      totalRevenue,
      totalThirdPartyCost,
      estimatedGrossProfit,
      profitMargin,
      totalOwnKg,
      totalThirdPartyKg,
      totalKg: totalOwnKg + totalThirdPartyKg,
      pendingPurchasesCount
    };
  }, [filteredKgSales]);

  // Lista consolidada de compras de terceiros
  const consolidatedShoppingList = useMemo(() => {
    const productMap = new Map<string, {
      name: string;
      unit: string;
      totalQuantity: number;
      estimatedUnitCost: number;
      totalEstimatedCost: number;
      allPurchased: boolean;
      orders: { saleId: string; customerName: string; quantity: number; purchased: boolean }[];
    }>();

    filteredKgSales.forEach(sale => {
      if (sale.status === 'cancelled' || sale.status === 'paid') return;

      sale.items.forEach(item => {
        if (item.source === 'third_party') {
          const canonical = getCanonicalProductName(item.name);
          const key = normalizeProductName(canonical);
          const qty = Number(item.quantity) || 0;
          const cost = Number(item.cost || item.estimatedCost || 0);

          if (!productMap.has(key)) {
            productMap.set(key, {
              name: canonical,
              unit: item.unit || 'kg',
              totalQuantity: qty,
              estimatedUnitCost: cost,
              totalEstimatedCost: cost * qty,
              allPurchased: !!item.purchased,
              orders: [{
                saleId: sale.id,
                customerName: sale.customerName,
                quantity: qty,
                purchased: !!item.purchased
              }]
            });
          } else {
            const existing = productMap.get(key)!;
            existing.totalQuantity += qty;
            existing.totalEstimatedCost += cost * qty;
            if (cost > 0) existing.estimatedUnitCost = cost;
            if (!item.purchased) existing.allPurchased = false;
            existing.orders.push({
              saleId: sale.id,
              customerName: sale.customerName,
              quantity: qty,
              purchased: !!item.purchased
            });
          }
        }
      });
    });

    return Array.from(productMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredKgSales]);

  // Auto-preenchimento ao digitar telefone
  const handlePhoneChange = (phoneVal: string) => {
    setClientPhone(phoneVal);
    const clean = phoneVal.replace(/\D/g, '');
    if (clean.length >= 8) {
      // 1. Procura em vendas anteriores
      const prevSale = sales.find(s => s.customerPhone && s.customerPhone.replace(/\D/g, '').includes(clean));
      if (prevSale) {
        if (!clientName && prevSale.customerName) setClientName(prevSale.customerName);
        if (!clientAddress && prevSale.deliveryAddress) setClientAddress(prevSale.deliveryAddress);
        if (!clientNotes && prevSale.observations) setClientNotes(prevSale.observations);
        return;
      }

      // 2. Procura em clientes cadastrados
      const prevCust = customers.find(c => c.phone && c.phone.replace(/\D/g, '').includes(clean));
      if (prevCust) {
        if (!clientName) setClientName(prevCust.companyName || prevCust.contactName);
      }
    }
  };

  // Abrir Modal de Novo Pedido
  const handleOpenNewOrderModal = (saleToEdit?: Sale) => {
    setError(null);
    if (saleToEdit) {
      setEditingSale(saleToEdit);
      setClientName(saleToEdit.customerName || '');
      setClientPhone(saleToEdit.customerPhone || '');
      setClientAddress(saleToEdit.deliveryAddress || '');
      setClientNotes(saleToEdit.observations || '');
      const d = getSaleDateObj(saleToEdit);
      setDeliveryDateInput(d ? format(d, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
      setOrderItems(saleToEdit.items || []);
      setPaymentOption(saleToEdit.paymentMethods?.[0]?.method || 'Pagar na Entrega');
    } else {
      setEditingSale(null);
      setClientName('');
      setClientPhone('');
      setClientAddress('');
      setClientNotes('');
      setDeliveryDateInput(format(new Date(Date.now() + 86400000), 'yyyy-MM-dd'));
      setOrderItems([]);
      setPaymentOption('Pagar na Entrega');
    }
    setIsNewOrderModalOpen(true);
  };

  // Adicionar item da Horta Própria ao pedido
  const handleAddOwnProduceItem = (produce: ProduceCatalogItem) => {
    const canonical = getCanonicalProductName(produce.name);
    const existingIndex = orderItems.findIndex(
      i => normalizeProductName(i.name) === normalizeProductName(canonical) && i.source === 'own_production'
    );

    if (existingIndex >= 0) {
      const updated = [...orderItems];
      updated[existingIndex].quantity = (Number(updated[existingIndex].quantity) || 0) + 1;
      setOrderItems(updated);
    } else {
      const newItem: SaleItem = {
        itemId: produce.id,
        name: canonical,
        quantity: 1,
        unit: 'kg', // No modo KG, alfaces e todas as folhosas e legumes são vendidos por kg
        price: produce.defaultPrice || 5.00,
        cost: 0, // Produção própria
        source: 'own_production',
        purchased: true, // Já é da horta
        originalRequestedQty: 1
      };
      setOrderItems([...orderItems, newItem]);
    }
  };

  // Adicionar item sugerido de terceiros
  const handleAddSuggestedThirdParty = (item: typeof POPULAR_THIRD_PARTY_ITEMS[0]) => {
    const canonical = getCanonicalProductName(item.name);
    const existingIndex = orderItems.findIndex(
      i => normalizeProductName(i.name) === normalizeProductName(canonical) && i.source === 'third_party'
    );

    if (existingIndex >= 0) {
      const updated = [...orderItems];
      updated[existingIndex].quantity = (Number(updated[existingIndex].quantity) || 0) + 1;
      setOrderItems(updated);
    } else {
      const newItem: SaleItem = {
        itemId: `third_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name: canonical,
        quantity: 1,
        unit: item.unit || 'kg',
        price: item.defaultPrice,
        cost: item.defaultCost,
        estimatedCost: item.defaultCost,
        source: 'third_party',
        purchased: false,
        originalRequestedQty: 1
      };
      setOrderItems([...orderItems, newItem]);
    }
  };

  // Adicionar item customizado de terceiros digitado livremente
  const handleAddCustomThirdParty = () => {
    if (!customItemName.trim()) {
      setError('Informe o nome do produto para compra externa.');
      return;
    }
    const qty = Number(customItemQty) || 1;
    const price = Number(customItemPrice) || 0;
    const cost = Number(customItemCost) || 0;

    const canonical = getCanonicalProductName(customItemName.trim());
    const newItem: SaleItem = {
      itemId: `third_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: canonical,
      quantity: qty,
      unit: customItemUnit.trim() || 'kg',
      price: price,
      cost: cost,
      estimatedCost: cost,
      source: 'third_party',
      purchased: false,
      supplierNotes: customItemSupplierNotes.trim(),
      originalRequestedQty: qty
    };

    setOrderItems([...orderItems, newItem]);
    setCustomItemName('');
    setCustomItemQty('');
    setCustomItemCost('');
    setCustomItemPrice('');
    setCustomItemSupplierNotes('');
    setError(null);
  };

  // Atualizar campo de item no pedido
  const handleUpdateItemField = (index: number, field: keyof SaleItem, value: any) => {
    const updated = [...orderItems];
    updated[index] = { ...updated[index], [field]: value };
    setOrderItems(updated);
  };

  // Remover item do pedido
  const handleRemoveOrderItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  // Cálculos do Pedido em Edição
  const orderSummary = useMemo(() => {
    let subtotal = 0;
    let totalCost = 0;
    let ownKg = 0;
    let thirdPartyKg = 0;

    orderItems.forEach(item => {
      const q = Number(item.quantity) || 0;
      const p = Number(item.price) || 0;
      const c = Number(item.cost || item.estimatedCost || 0);

      subtotal += q * p;
      if (item.source === 'third_party') {
        thirdPartyKg += q;
        totalCost += q * c;
      } else {
        ownKg += q;
      }
    });

    const profit = subtotal - totalCost;
    const margin = subtotal > 0 ? (profit / subtotal) * 100 : 0;

    return {
      subtotal,
      totalCost,
      profit,
      margin,
      ownKg,
      thirdPartyKg,
      totalKg: ownKg + thirdPartyKg
    };
  }, [orderItems]);

  // Salvar Pedido por KG no Firestore
  const handleSaveKgOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) {
      setError('Informe o nome do cliente.');
      return;
    }
    if (orderItems.length === 0) {
      setError('Adicione pelo menos um produto ao pedido.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const deliveryDateObj = deliveryDateInput ? new Date(deliveryDateInput + 'T12:00:00') : new Date();
      const allThirdPurchased = !orderItems.some(i => i.source === 'third_party' && !i.purchased);

      const saleData: Partial<Sale> = {
        customerName: clientName.trim(),
        customerPhone: clientPhone.trim() || undefined,
        deliveryAddress: clientAddress.trim() || undefined,
        observations: clientNotes.trim() || undefined,
        isDelivery: true,
        isKgMode: true,
        items: orderItems,
        total: orderSummary.subtotal,
        totalCost: orderSummary.totalCost,
        estimatedProfit: orderSummary.profit,
        profitMargin: orderSummary.margin,
        thirdPartyPurchased: allThirdPurchased,
        deliveryDate: deliveryDateObj,
        status: editingSale ? editingSale.status : 'ordered',
        paymentMethods: [{ method: paymentOption, amount: orderSummary.subtotal }]
      };

      if (editingSale) {
        await updateDoc(doc(db, 'sales', editingSale.id), saleData);
      } else {
        const saleNumber = `KG-${Date.now().toString().slice(-4)}`;
        await addDoc(collection(db, 'sales'), {
          ...saleData,
          saleNumber,
          createdAt: serverTimestamp()
        });
      }

      setIsNewOrderModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setError('Erro ao salvar pedido: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  // Marcar item de compra como "Comprado"
  const handleToggleItemPurchased = async (saleId: string, itemIndex: number, currentVal: boolean) => {
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;

    try {
      const updatedItems = [...sale.items];
      if (updatedItems[itemIndex]) {
        updatedItems[itemIndex].purchased = !currentVal;
      }
      const allPurchased = !updatedItems.some(i => i.source === 'third_party' && !i.purchased);
      await updateDoc(doc(db, 'sales', saleId), {
        items: updatedItems,
        thirdPartyPurchased: allPurchased
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Marcar TODOS os itens de um produto consolidado como "Comprados"
  const handleToggleConsolidatedProduct = async (productOrders: { saleId: string; quantity: number; purchased: boolean }[], targetPurchased: boolean) => {
    try {
      for (const order of productOrders) {
        const sale = sales.find(s => s.id === order.saleId);
        if (!sale) continue;

        const updatedItems = sale.items.map(item => {
          if (item.source === 'third_party' && normalizeProductName(item.name) === normalizeProductName(sale.items.find(i => i.source === 'third_party')?.name || '')) {
            return { ...item, purchased: targetPurchased };
          }
          return item;
        });

        const allPurchased = !updatedItems.some(i => i.source === 'third_party' && !i.purchased);
        await updateDoc(doc(db, 'sales', order.saleId), {
          items: updatedItems,
          thirdPartyPurchased: allPurchased
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Abrir Modal de Pesagem Real
  const handleOpenWeighingModal = (sale: Sale) => {
    setSelectedSaleForWeighing(sale);
    const initialInputs: Record<number, number> = {};
    sale.items.forEach((item, idx) => {
      initialInputs[idx] = item.actualWeightedQty !== undefined ? item.actualWeightedQty : item.quantity;
    });
    setWeighingInputs(initialInputs);
    setIsWeighingModalOpen(true);
  };

  // Salvar Pesagem Real na Balança
  const handleSaveWeighing = async () => {
    if (!selectedSaleForWeighing) return;
    setSaving(true);
    try {
      let newTotal = 0;
      let newTotalCost = 0;

      const updatedItems = selectedSaleForWeighing.items.map((item, idx) => {
        const weightedQty = weighingInputs[idx] !== undefined ? Number(weighingInputs[idx]) : item.quantity;
        const price = Number(item.price) || 0;
        const cost = Number(item.cost || item.estimatedCost || 0);

        newTotal += weightedQty * price;
        if (item.source === 'third_party') {
          newTotalCost += weightedQty * cost;
        }

        return {
          ...item,
          quantity: weightedQty,
          actualWeightedQty: weightedQty
        };
      });

      const profit = newTotal - newTotalCost;
      const margin = newTotal > 0 ? (profit / newTotal) * 100 : 0;

      await updateDoc(doc(db, 'sales', selectedSaleForWeighing.id), {
        items: updatedItems,
        total: newTotal,
        totalCost: newTotalCost,
        estimatedProfit: profit,
        profitMargin: margin,
        paymentMethods: [{ method: selectedSaleForWeighing.paymentMethods?.[0]?.method || 'Pagar na Entrega', amount: newTotal }]
      });

      setIsWeighingModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setError('Erro ao salvar pesagem: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  // Lançar despesa de compras de terceiros direto no módulo financeiro
  const handleRecordThirdPartyExpense = async () => {
    if (consolidatedShoppingList.length === 0) return;
    const totalExpense = consolidatedShoppingList.reduce((acc, p) => acc + p.totalEstimatedCost, 0);
    if (totalExpense <= 0) return;

    setSaving(true);
    try {
      const summaryText = consolidatedShoppingList.map(p => `${p.name} (${p.totalQuantity} ${p.unit})`).join(', ');
      await addDoc(collection(db, 'transactions'), {
        type: 'expense',
        amount: totalExpense,
        description: `Compras de Terceiros p/ Revenda: ${summaryText.slice(0, 100)}`,
        category: 'Mercadorias para Revenda',
        date: new Date()
      });

      setExpenseSavedFeedback(true);
      setTimeout(() => setExpenseSavedFeedback(false), 4000);
    } catch (err: any) {
      console.error(err);
      setError('Erro ao lançar despesa no financeiro: ' + (err.message || 'Erro'));
    } finally {
      setSaving(false);
    }
  };

  // Avançar Status do Pedido
  const handleAdvanceStatus = async (sale: Sale) => {
    try {
      if (sale.status === 'ordered' || sale.status === 'pending') {
        await updateDoc(doc(db, 'sales', sale.id), { status: 'pending_delivery' });
      } else if (sale.status === 'pending_delivery') {
        await updateDoc(doc(db, 'sales', sale.id), { status: 'delivered' });
      } else if (sale.status === 'delivered') {
        // Concluir e registrar receita financeira
        await updateDoc(doc(db, 'sales', sale.id), { 
          status: 'paid',
          confirmedAt: serverTimestamp()
        });

        // Lança receita no financeiro se ainda não foi lançada
        await addDoc(collection(db, 'transactions'), {
          type: 'income',
          amount: sale.total,
          description: `Venda por KG / Entrega - ${sale.customerName} (${sale.saleNumber || ''})`,
          category: 'Venda de Produção e Revenda',
          date: new Date(),
          relatedSaleId: sale.id
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Excluir Pedido
  const handleDeleteSale = async (saleId: string) => {
    if (confirm('Deseja realmente excluir este pedido por KG?')) {
      try {
        await deleteDoc(doc(db, 'sales', saleId));
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Copiar Romaneio para WhatsApp
  const handleCopyWhatsAppReceipt = (sale: Sale) => {
    const delDate = getSaleDateObj(sale);
    const formattedDate = delDate ? format(delDate, "dd/MM/yyyy (EEEE)", { locale: ptBR }) : 'A combinar';

    let text = `🌿 *HORTA & DISTRIBUIÇÃO - ROMANEIO DE PEDIDO*\n`;
    text += `📋 *Pedido:* ${sale.saleNumber || 'S/N'}\n`;
    text += `👤 *Cliente:* ${sale.customerName}\n`;
    if (sale.customerPhone) text += `📞 *Telefone:* ${sale.customerPhone}\n`;
    if (sale.deliveryAddress) text += `📍 *Endereço:* ${sale.deliveryAddress}\n`;
    text += `📅 *Data de Entrega:* ${formattedDate}\n\n`;
    text += `🛒 *ITENS DO PEDIDO:*\n`;

    sale.items.forEach((item, idx) => {
      const isWeighted = item.actualWeightedQty !== undefined;
      const qtyStr = Number(item.quantity).toFixed(item.unit === 'kg' ? 2 : 0);
      const sub = (Number(item.quantity) * Number(item.price)).toFixed(2);
      text += `${idx + 1}. *${item.name}* - ${qtyStr} ${item.unit || 'kg'} x R$ ${(item.price || 0).toFixed(2)} = *R$ ${sub}* ${isWeighted ? '⚖️ (Pesado)' : ''}\n`;
    });

    text += `\n💰 *TOTAL A PAGAR: R$ ${(sale.total || 0).toFixed(2)}*\n`;
    if (sale.observations) text += `📝 *Obs:* ${sale.observations}\n`;
    text += `\nMuito obrigado pela preferência! Ficamos à disposição. 🙏🌱`;

    navigator.clipboard.writeText(text);
    setCopiedMessageId(sale.id);
    setTimeout(() => setCopiedMessageId(null), 3000);
  };

  // Copiar Lista de Compras para WhatsApp (Para levar ao Ceasa/Mercado)
  const handleCopyShoppingListToWhatsApp = () => {
    let text = `🛒 *LISTA DE COMPRAS - FEIRA / CEASA / FORNECEDORES*\n`;
    text += `📅 *Data de Referência:* ${dateFilter === 'today' ? 'Hoje' : dateFilter === 'tomorrow' ? 'Amanhã' : 'Geral'}\n`;
    text += `📦 *Total de Itens:* ${consolidatedShoppingList.length} variedades\n\n`;

    consolidatedShoppingList.forEach((prod, i) => {
      const statusEmoji = prod.allPurchased ? '✅' : '⬜';
      text += `${statusEmoji} ${i + 1}. *${prod.name}*: *${prod.totalQuantity.toFixed(2)} ${prod.unit}* (Est. R$ ${prod.totalEstimatedCost.toFixed(2)})\n`;
    });

    const totalEst = consolidatedShoppingList.reduce((acc, p) => acc + p.totalEstimatedCost, 0);
    text += `\n💵 *Custo Total Estimado de Compras:* R$ ${totalEst.toFixed(2)}`;

    navigator.clipboard.writeText(text);
    setCopiedMessageId('shopping_list');
    setTimeout(() => setCopiedMessageId(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* CABEÇALHO E MÉTRICAS */}
      <div className="bg-gradient-to-br from-emerald-900 via-slate-900 to-slate-950 p-6 md:p-8 rounded-3xl text-white shadow-xl border border-emerald-800/30">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-800">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-black uppercase tracking-wider">
              <Scale size={13} className="text-emerald-400" />
              Modo Venda por KG & Revenda
            </div>
            <h3 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-2">
              Gestão de Pedidos por Peso (Horta + Terceiros)
            </h3>
            <p className="text-slate-300 text-xs md:text-sm max-w-2xl leading-relaxed">
              Venda por KG com itens da horta própria e mercadorias compradas de fornecedores. Controle custos, margem de lucro, lista consolidada de compras e pesagem na balança.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => handleOpenNewOrderModal()}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-5 py-3 rounded-2xl font-black text-sm transition-all shadow-lg shadow-emerald-500/20 cursor-pointer active:scale-95"
            >
              <Plus size={18} className="stroke-[3]" />
              Novo Pedido por KG
            </button>
            <button
              onClick={() => setIsShoppingListModalOpen(true)}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 px-4 py-3 rounded-2xl font-bold text-xs md:text-sm transition-all cursor-pointer active:scale-95"
            >
              <ShoppingCart size={16} className="text-amber-400" />
              Lista de Compras ({consolidatedShoppingList.length})
            </button>
          </div>
        </div>

        {/* CARDS DE RESUMO DO MODO KG */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 mt-6">
          <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-2xl">
            <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">Pedidos por KG</span>
            <span className="text-xl md:text-2xl font-black text-white mt-1 block">{metrics.totalOrders}</span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">{metrics.totalKg.toFixed(1)} kg no total</span>
          </div>

          <div className="bg-emerald-950/60 border border-emerald-800/50 p-4 rounded-2xl">
            <span className="text-[11px] font-bold text-emerald-300 block uppercase tracking-wider">🌿 Horta Própria</span>
            <span className="text-xl md:text-2xl font-black text-emerald-400 mt-1 block">{metrics.totalOwnKg.toFixed(1)} <span className="text-sm font-bold">kg</span></span>
            <span className="text-[10px] text-emerald-200/70 mt-0.5 block">Colheita direta</span>
          </div>

          <div className="bg-amber-950/60 border border-amber-800/50 p-4 rounded-2xl">
            <span className="text-[11px] font-bold text-amber-300 block uppercase tracking-wider">🛒 Compra de Terceiros</span>
            <span className="text-xl md:text-2xl font-black text-amber-400 mt-1 block">{metrics.totalThirdPartyKg.toFixed(1)} <span className="text-sm font-bold">kg</span></span>
            <span className="text-[10px] text-amber-200/70 mt-0.5 block">Custo: R$ {metrics.totalThirdPartyCost.toFixed(2)}</span>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-2xl">
            <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">Faturamento Previsto</span>
            <span className="text-xl md:text-2xl font-black text-white mt-1 block">R$ {metrics.totalRevenue.toFixed(2)}</span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Total a receber</span>
          </div>

          <div className="bg-emerald-900/50 border border-emerald-500/40 p-4 rounded-2xl col-span-2 sm:col-span-1">
            <span className="text-[11px] font-bold text-emerald-300 block uppercase tracking-wider">Lucro Bruto Previsto</span>
            <span className="text-xl md:text-2xl font-black text-emerald-300 mt-1 block">R$ {metrics.estimatedGrossProfit.toFixed(2)}</span>
            <span className="text-[10px] text-emerald-200 font-extrabold mt-0.5 block">Margem: {metrics.profitMargin.toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Filtro de Datas */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setDateFilter('all')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              dateFilter === 'all' ? "bg-white text-emerald-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
            )}
          >
            Todas as Datas
          </button>
          <button
            onClick={() => setDateFilter('today')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              dateFilter === 'today' ? "bg-white text-emerald-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
            )}
          >
            Hoje
          </button>
          <button
            onClick={() => setDateFilter('tomorrow')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              dateFilter === 'tomorrow' ? "bg-white text-emerald-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
            )}
          >
            Amanhã
          </button>
          <button
            onClick={() => setDateFilter('week')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              dateFilter === 'week' ? "bg-white text-emerald-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
            )}
          >
            Esta Semana
          </button>
        </div>

        {/* Busca e Status */}
        <div className="flex flex-col sm:flex-row items-center gap-2 flex-1 md:justify-end">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Buscar cliente, tel, produto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="w-full sm:w-auto px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">Todos os Status</option>
            <option value="needs_purchase">🛒 Compras Pendentes</option>
            <option value="purchased">✅ Compras Feitas</option>
            <option value="delivered">🚚 Em Entrega</option>
            <option value="paid">💰 Concluído & Pago</option>
          </select>
        </div>
      </div>

      {/* LISTA DE CARDS DE PEDIDOS POR KG */}
      <div className="space-y-4">
        {filteredKgSales.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-400 space-y-3 shadow-sm">
            <Scale size={48} className="mx-auto text-slate-300 stroke-[1.5]" />
            <h4 className="text-lg font-bold text-slate-700">Nenhum pedido por KG encontrado</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Clique no botão "Novo Pedido por KG" para lançar uma entrega com produtos pesados e itens comprados de terceiros.
            </p>
            <button
              onClick={() => handleOpenNewOrderModal()}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer"
            >
              <Plus size={16} /> Criar Primeiro Pedido
            </button>
          </div>
        ) : (
          filteredKgSales.map(sale => {
            const delDate = getSaleDateObj(sale);
            const formattedDeliveryDate = delDate 
              ? format(delDate, "dd 'de' MMMM (EEEE)", { locale: ptBR }) 
              : 'Data não informada';

            const ownItems = sale.items.filter(i => i.source !== 'third_party');
            const thirdItems = sale.items.filter(i => i.source === 'third_party');
            const allThirdPurchased = !thirdItems.some(i => !i.purchased);

            let ownKg = 0;
            let thirdKg = 0;
            let totalCost = 0;

            sale.items.forEach(i => {
              const q = Number(i.quantity) || 0;
              if (i.source === 'third_party') {
                thirdKg += q;
                totalCost += q * Number(i.cost || i.estimatedCost || 0);
              } else {
                ownKg += q;
              }
            });

            const profit = sale.total - totalCost;
            const margin = sale.total > 0 ? (profit / sale.total) * 100 : 0;

            return (
              <div 
                key={sale.id}
                className={cn(
                  "bg-white rounded-3xl border transition-all p-5 md:p-6 shadow-sm space-y-4 hover:shadow-md",
                  sale.status === 'paid' ? "border-slate-200 bg-slate-50/40" : "border-slate-200"
                )}
              >
                {/* TOPO DO CARD */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 border",
                      sale.status === 'paid' 
                        ? "bg-emerald-100 text-emerald-800 border-emerald-200" 
                        : "bg-emerald-50 text-emerald-700 border-emerald-100"
                    )}>
                      <Scale size={20} />
                    </div>
                    <div>
                      <div className="flex items-center flex-wrap gap-2">
                        <h4 className="text-base font-black text-slate-900">{sale.customerName}</h4>
                        <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg font-bold">
                          {sale.saleNumber || 'KG-S/N'}
                        </span>
                        {thirdItems.length > 0 && (
                          <span className={cn(
                            "text-[9px] px-2 py-0.5 rounded-md font-black uppercase tracking-wider border",
                            allThirdPurchased 
                              ? "bg-blue-50 text-blue-700 border-blue-200" 
                              : "bg-amber-50 text-amber-700 border-amber-200 animate-pulse"
                          )}>
                            {allThirdPurchased ? '🛒 Compras OK' : '🛒 Comprar no Ceasa/Fornecedor'}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500 mt-0.5">
                        {sale.customerPhone && <span>📞 {sale.customerPhone}</span>}
                        {sale.deliveryAddress && <span className="truncate max-w-xs">📍 {sale.deliveryAddress}</span>}
                        <span className="font-bold text-emerald-700">📅 Entrega: {formattedDeliveryDate}</span>
                      </div>
                    </div>
                  </div>

                  {/* VALORES E STATUS */}
                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    <div className="text-left sm:text-right">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">Total do Pedido</span>
                      <span className="text-lg font-black text-slate-900 block">R$ {(sale.total || 0).toFixed(2)}</span>
                      {totalCost > 0 && (
                        <span className="text-[10px] font-extrabold text-emerald-600 block">
                          Lucro: R$ {profit.toFixed(2)} ({margin.toFixed(0)}%)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* DISCRIMINAÇÃO DOS ITENS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Itens da Horta */}
                  <div className="bg-emerald-50/40 border border-emerald-100 rounded-2xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-emerald-800 flex items-center gap-1.5">
                        🌿 Itens da Horta Própria ({ownKg.toFixed(1)} kg)
                      </span>
                    </div>
                    {ownItems.length === 0 ? (
                      <span className="text-[11px] text-slate-400 italic block">Nenhum item da horta</span>
                    ) : (
                      <div className="space-y-1.5">
                        {ownItems.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs bg-white p-2 rounded-xl border border-emerald-100/60 shadow-2xs">
                            <span className="font-bold text-slate-800">{item.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-slate-600">{Number(item.quantity).toFixed(2)} {item.unit || 'kg'}</span>
                              <span className="text-slate-400">•</span>
                              <span className="font-bold text-emerald-700">R$ {(Number(item.quantity) * Number(item.price)).toFixed(2)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Itens de Terceiros */}
                  <div className="bg-amber-50/40 border border-amber-100 rounded-2xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-amber-800 flex items-center gap-1.5">
                        🛒 Itens de Terceiros / Revenda ({thirdKg.toFixed(1)} kg)
                      </span>
                    </div>
                    {thirdItems.length === 0 ? (
                      <span className="text-[11px] text-slate-400 italic block">Nenhum item de terceiros</span>
                    ) : (
                      <div className="space-y-1.5">
                        {thirdItems.map((item, idx) => {
                          const originalItemIdx = sale.items.indexOf(item);
                          const itemCost = Number(item.cost || item.estimatedCost || 0);
                          const itemTotal = Number(item.quantity) * Number(item.price);
                          const itemTotalCost = Number(item.quantity) * itemCost;
                          const itemProfit = itemTotal - itemTotalCost;

                          return (
                            <div key={idx} className="flex items-center justify-between text-xs bg-white p-2 rounded-xl border border-amber-100/80 shadow-2xs gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => handleToggleItemPurchased(sale.id, originalItemIdx, !!item.purchased)}
                                  className={cn(
                                    "w-5 h-5 rounded-md flex items-center justify-center transition-all shrink-0 cursor-pointer",
                                    item.purchased ? "bg-emerald-600 text-white" : "border border-slate-300 bg-slate-50 hover:bg-slate-100"
                                  )}
                                  title={item.purchased ? "Marcado como comprado" : "Clique para marcar como comprado"}
                                >
                                  {item.purchased && <Check size={12} className="stroke-[3]" />}
                                </button>
                                <div className="truncate">
                                  <span className={cn("font-bold block truncate", item.purchased ? "line-through text-slate-400" : "text-slate-800")}>
                                    {item.name}
                                  </span>
                                  <span className="text-[10px] text-slate-400 block">
                                    Custo: R$ {itemCost.toFixed(2)} | Venda: R$ {(item.price || 0).toFixed(2)}
                                  </span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="font-extrabold text-slate-700 block">{Number(item.quantity).toFixed(2)} {item.unit || 'kg'}</span>
                                <span className="font-bold text-amber-700 block">R$ {itemTotal.toFixed(2)} <span className="text-[10px] text-emerald-600">(+R$ {itemProfit.toFixed(2)})</span></span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* BOTÕES DE AÇÃO DO CARD */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenWeighingModal(sale)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
                      title="Conferir pesagem real na balança"
                    >
                      <Scale size={14} className="text-emerald-600" />
                      Conferir Balança
                    </button>
                    <button
                      onClick={() => handleCopyWhatsAppReceipt(sale)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
                    >
                      {copiedMessageId === sale.id ? (
                        <>
                          <Check size={14} className="text-emerald-600" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Send size={14} />
                          <span>Comprovante WhatsApp</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenNewOrderModal(sale)}
                      className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-all"
                      title="Editar Pedido"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteSale(sale.id)}
                      className="p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all"
                      title="Excluir Pedido"
                    >
                      <Trash2 size={16} />
                    </button>

                    {sale.status !== 'paid' && sale.status !== 'confirmed' && (
                      <button
                        onClick={() => handleAdvanceStatus(sale)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-black text-xs transition-all shadow-md shadow-emerald-100 cursor-pointer active:scale-95"
                      >
                        {(sale.status === 'ordered' || sale.status === 'pending') && 'Pronto para Entrega'}
                        {sale.status === 'pending_delivery' && 'Confirmar Entrega'}
                        {sale.status === 'delivered' && 'Confirmar Pagamento & Concluir'}
                      </button>
                    )}

                    {(sale.status === 'paid' || sale.status === 'confirmed') && (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-black border border-emerald-200">
                        <CheckCircle2 size={14} /> Pago & Concluído
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ================= MODAL DE NOVO PEDIDO POR KG ================= */}
      {isNewOrderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-150 p-6 md:p-8 space-y-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 font-bold">
                  <Scale size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">
                    {editingSale ? 'Editar Pedido por KG' : 'Novo Pedido de Entrega por KG'}
                  </h3>
                  <p className="text-xs text-slate-400">Monte o pedido com produtos da horta e produtos de compras externas.</p>
                </div>
              </div>
              <button
                onClick={() => setIsNewOrderModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-2xl flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSaveKgOrder} className="space-y-6">
              {/* PASSO 1: DADOS DO CLIENTE */}
              <div className="bg-slate-50/70 p-4 md:p-5 rounded-2xl border border-slate-200 space-y-4">
                <span className="text-xs font-black uppercase text-slate-400 tracking-wider block">
                  1. Dados do Cliente e Entrega
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Telefone / WhatsApp</label>
                    <input
                      type="text"
                      placeholder="Ex: (48) 99999-9999"
                      value={clientPhone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-bold text-slate-700">Nome do Cliente *</label>
                    <input
                      type="text"
                      placeholder="Ex: Restaurante Sabor Verde, Maria Silva..."
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-bold text-slate-700">Endereço de Entrega</label>
                    <input
                      type="text"
                      placeholder="Rua, número, bairro..."
                      value={clientAddress}
                      onChange={(e) => setClientAddress(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Data de Entrega *</label>
                    <input
                      type="date"
                      value={deliveryDateInput}
                      onChange={(e) => setDeliveryDateInput(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-emerald-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* PASSO 2: ESCOLHER PRODUTOS (HORTA vs TERCEIROS) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-slate-400 tracking-wider">
                    2. Escolha os Produtos para o Pedido
                  </span>
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setProductOriginTab('own')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                        productOriginTab === 'own' ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-900"
                      )}
                    >
                      🌿 Horta Própria
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductOriginTab('third_party')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                        productOriginTab === 'third_party' ? "bg-white text-amber-700 shadow-sm" : "text-slate-500 hover:text-slate-900"
                      )}
                    >
                      🛒 Compra de Terceiros (Revenda)
                    </button>
                  </div>
                </div>

                {/* ABA: HORTA PRÓPRIA */}
                {productOriginTab === 'own' && (
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        type="text"
                        placeholder="Buscar produto do catálogo da horta..."
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1.5 bg-slate-50/50 rounded-2xl border border-slate-100">
                      {uniqueCatalog
                        .filter(i => i.name.toLowerCase().includes(productSearch.toLowerCase()))
                        .map(item => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleAddOwnProduceItem(item)}
                            className="p-2.5 rounded-xl bg-white border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/30 text-left transition-all group flex flex-col justify-between cursor-pointer"
                          >
                            <span className="font-bold text-xs text-slate-800 group-hover:text-emerald-800 block truncate">
                              {item.name}
                            </span>
                            <div className="flex items-center justify-between mt-1 text-[10px]">
                              <span className="text-slate-400 font-bold">R$ {(item.defaultPrice || 0).toFixed(2)}/kg</span>
                              <Plus size={14} className="text-emerald-600 group-hover:scale-125 transition-transform" />
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                {/* ABA: COMPRA DE TERCEIROS / REVENDA */}
                {productOriginTab === 'third_party' && (
                  <div className="space-y-4">
                    {/* Formulário Rápido de Inserção Livre */}
                    <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-200/70 space-y-3">
                      <span className="text-xs font-black text-amber-900 block">
                        Cadastrar Novo Produto para Comprar de Fora:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
                        <div className="sm:col-span-2">
                          <input
                            type="text"
                            placeholder="Nome do produto (ex: Tomate Carmem)"
                            value={customItemName}
                            onChange={(e) => setCustomItemName(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
                          />
                        </div>
                        <div>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Qtd (kg)"
                            value={customItemQty}
                            onChange={(e) => setCustomItemQty(e.target.value === '' ? '' : parseFloat(e.target.value))}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
                          />
                        </div>
                        <div>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Custo R$/kg"
                            value={customItemCost}
                            onChange={(e) => setCustomItemCost(e.target.value === '' ? '' : parseFloat(e.target.value))}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
                          />
                        </div>
                        <div>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Venda R$/kg"
                            value={customItemPrice}
                            onChange={(e) => setCustomItemPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
                          />
                        </div>
                        <div>
                          <button
                            type="button"
                            onClick={handleAddCustomThirdParty}
                            className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                          >
                            <Plus size={14} /> Adicionar
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Sugestões Populares */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        Produtos Frequentes de Terceiros (Clique para adicionar):
                      </span>
                      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1.5 bg-slate-50 rounded-2xl border border-slate-100">
                        {POPULAR_THIRD_PARTY_ITEMS.map((sug, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => handleAddSuggestedThirdParty(sug)}
                            className="px-2.5 py-1.5 bg-white hover:bg-amber-50 hover:border-amber-300 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                          >
                            <span>{sug.name}</span>
                            <span className="text-[10px] text-amber-700 font-extrabold">(R$ {sug.defaultPrice.toFixed(2)})</span>
                            <Plus size={12} className="text-amber-600" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* PASSO 3: TABELA DE ITENS SELECIONADOS NO PEDIDO */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-slate-700 tracking-wider">
                      3. Itens Selecionados no Pedido ({orderItems.length})
                    </span>
                    <span className="text-xs font-extrabold text-slate-600">
                      Peso Total: {orderSummary.totalKg.toFixed(2)} kg
                    </span>
                  </div>

                  {orderItems.length === 0 ? (
                    <div className="p-6 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs font-medium">
                      Nenhum produto adicionado ainda. Escolha produtos da horta ou de terceiros acima.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto p-1">
                      {orderItems.map((item, idx) => {
                        const isThird = item.source === 'third_party';
                        const itemCost = Number(item.cost || item.estimatedCost || 0);
                        const itemTotal = Number(item.quantity) * Number(item.price);
                        const itemTotalCost = Number(item.quantity) * itemCost;
                        const itemProfit = itemTotal - itemTotalCost;

                        return (
                          <div 
                            key={idx}
                            className={cn(
                              "p-3 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs",
                              isThird ? "bg-amber-50/40 border-amber-200" : "bg-emerald-50/40 border-emerald-200"
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={cn(
                                "text-[10px] px-2 py-0.5 rounded-lg font-black uppercase tracking-wider",
                                isThird ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                              )}>
                                {isThird ? '🛒 Terceiro' : '🌿 Horta'}
                              </span>
                              <span className="font-bold text-slate-900 text-sm truncate">{item.name}</span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5">
                              {/* Quantidade e Unidade */}
                              <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-xl border border-slate-200">
                                <label className="text-[10px] font-extrabold text-slate-400">Qtd:</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  value={item.quantity}
                                  onChange={(e) => handleUpdateItemField(idx, 'quantity', parseFloat(e.target.value) || 0)}
                                  className="w-16 text-xs font-black text-slate-800 outline-none text-right"
                                />
                                <select
                                  value={item.unit || 'kg'}
                                  onChange={(e) => handleUpdateItemField(idx, 'unit', e.target.value)}
                                  className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 outline-none cursor-pointer"
                                >
                                  <option value="kg">kg</option>
                                  <option value="un">un</option>
                                  <option value="pct">pct</option>
                                  <option value="dz">dz</option>
                                  <option value="cx">cx</option>
                                </select>
                              </div>

                              {/* Preço de Custo (se for terceiro) */}
                              {isThird && (
                                <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-amber-200">
                                  <label className="text-[10px] font-extrabold text-amber-700">Custo:</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={item.cost || item.estimatedCost || 0}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      handleUpdateItemField(idx, 'cost', val);
                                      handleUpdateItemField(idx, 'estimatedCost', val);
                                    }}
                                    className="w-14 text-xs font-black text-slate-800 outline-none text-right"
                                  />
                                </div>
                              )}

                              {/* Preço de Venda */}
                              <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-slate-200">
                                <label className="text-[10px] font-extrabold text-slate-400">Venda:</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.price}
                                  onChange={(e) => handleUpdateItemField(idx, 'price', parseFloat(e.target.value) || 0)}
                                  className="w-14 text-xs font-black text-emerald-700 outline-none text-right"
                                />
                              </div>

                              {/* Subtotal */}
                              <div className="text-right min-w-[70px]">
                                <span className="text-xs font-black text-slate-900 block">R$ {itemTotal.toFixed(2)}</span>
                                {isThird && (
                                  <span className="text-[9px] font-extrabold text-emerald-600 block">+R$ {itemProfit.toFixed(2)}</span>
                                )}
                              </div>

                              {/* Remover */}
                              <button
                                type="button"
                                onClick={() => handleRemoveOrderItem(idx)}
                                className="w-7 h-7 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center transition-all cursor-pointer"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* PASSO 4: RESUMO FINANCEIRO E BOTÃO SALVAR */}
              <div className="bg-slate-900 text-white p-5 md:p-6 rounded-3xl space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4 border-b border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Horta Própria</span>
                    <span className="text-base font-black text-emerald-400">{orderSummary.ownKg.toFixed(2)} kg</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Terceiros (Revenda)</span>
                    <span className="text-base font-black text-amber-400">{orderSummary.thirdPartyKg.toFixed(2)} kg</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Custo de Compra</span>
                    <span className="text-base font-black text-slate-300">R$ {orderSummary.totalCost.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Lucro Estimado</span>
                    <span className="text-base font-black text-emerald-300">R$ {orderSummary.profit.toFixed(2)} ({orderSummary.margin.toFixed(0)}%)</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs text-slate-400 block">Total a Cobrar do Cliente:</span>
                    <span className="text-2xl md:text-3xl font-black text-emerald-400">R$ {orderSummary.subtotal.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsNewOrderModalOpen(false)}
                      className="px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm transition-all shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
                    >
                      {saving ? 'Salvando...' : editingSale ? 'Salvar Alterações' : 'Confirmar Pedido por KG'}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: LISTA CONSOLIDADA DE COMPRAS (ROMANEIO DE FORNECEDORES) ================= */}
      {isShoppingListModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-150 p-6 md:p-8 space-y-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 font-bold">
                  <ShoppingCart size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">
                    Lista Consolidada de Compras (Ceasa / Fornecedores)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Soma automática de todos os produtos de terceiros que você precisa comprar para atender os pedidos.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsShoppingListModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            {expenseSavedFeedback && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                <span>Despesa de compras lançada com sucesso no módulo Financeiro!</span>
              </div>
            )}

            {consolidatedShoppingList.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 space-y-2">
                <ShoppingCart size={36} className="mx-auto text-slate-300" />
                <p className="font-bold text-sm text-slate-700">Nenhum item de terceiros para comprar</p>
                <p className="text-xs">Não há pedidos pendentes com mercadorias de compras externas no período filtrado.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-slate-500 tracking-wider">
                    Produtos Necessários ({consolidatedShoppingList.length} variedades)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyShoppingListToWhatsApp}
                      className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-black text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      {copiedMessageId === 'shopping_list' ? (
                        <>
                          <Check size={14} /> Copiado p/ WhatsApp!
                        </>
                      ) : (
                        <>
                          <Copy size={14} /> Copiar Lista p/ Celular
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto p-1">
                  {consolidatedShoppingList.map((prod, idx) => (
                    <div 
                      key={idx}
                      className={cn(
                        "p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3",
                        prod.allPurchased ? "bg-slate-50 border-slate-200 opacity-70" : "bg-white border-amber-200/90 shadow-2xs"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleToggleConsolidatedProduct(prod.orders, !prod.allPurchased)}
                          className={cn(
                            "w-6 h-6 rounded-lg flex items-center justify-center transition-all shrink-0 cursor-pointer",
                            prod.allPurchased ? "bg-emerald-600 text-white" : "border-2 border-slate-300 bg-white hover:border-amber-500"
                          )}
                          title={prod.allPurchased ? "Item já comprado" : "Clique para marcar como comprado"}
                        >
                          {prod.allPurchased && <Check size={14} className="stroke-[3]" />}
                        </button>
                        <div>
                          <span className={cn("text-sm font-black block", prod.allPurchased ? "line-through text-slate-400" : "text-slate-800")}>
                            {prod.name}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            Pedidos de: {prod.orders.map(o => `${o.customerName} (${o.quantity.toFixed(1)}${prod.unit})`).join(', ')}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-sm font-black text-amber-800 block">
                          {prod.totalQuantity.toFixed(2)} {prod.unit}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 block">
                          Custo estimado: R$ {prod.totalEstimatedCost.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* RODAPÉ DO MODAL DE COMPRAS */}
                <div className="bg-slate-900 text-white p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs text-slate-400 block">Custo Total Previsto das Compras:</span>
                    <span className="text-2xl font-black text-amber-400">
                      R$ {consolidatedShoppingList.reduce((acc, p) => acc + p.totalEstimatedCost, 0).toFixed(2)}
                    </span>
                  </div>

                  <button
                    onClick={handleRecordThirdPartyExpense}
                    disabled={saving}
                    className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <DollarSign size={16} />
                    Lançar Despesa no Financeiro
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL: CONFERÊNCIA DE BALANÇA & PESAGEM REAL ================= */}
      {isWeighingModalOpen && selectedSaleForWeighing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-150 p-6 md:p-8 space-y-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 font-bold">
                  <Scale size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">
                    Conferência de Balança (Pesagem Real)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Cliente: <b className="text-slate-700">{selectedSaleForWeighing.customerName}</b> ({selectedSaleForWeighing.saleNumber})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsWeighingModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <span className="text-xs font-black uppercase text-slate-400 tracking-wider block">
                Ajuste o peso exato medido na balança:
              </span>

              <div className="space-y-2">
                {selectedSaleForWeighing.items.map((item, idx) => {
                  const currentVal = weighingInputs[idx] !== undefined ? weighingInputs[idx] : item.quantity;
                  const price = Number(item.price) || 0;
                  const currentSubtotal = currentVal * price;

                  return (
                    <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <span className="font-black text-slate-800 text-sm block truncate">{item.name}</span>
                        <span className="text-[10px] text-slate-400 block">
                          Preço: R$ {price.toFixed(2)}/{item.unit || 'kg'} | Solicitado: {item.originalRequestedQty || item.quantity} {item.unit || 'kg'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-300">
                          <Scale size={14} className="text-emerald-600" />
                          <input
                            type="number"
                            step="0.01"
                            value={currentVal}
                            onChange={(e) => setWeighingInputs({
                              ...weighingInputs,
                              [idx]: parseFloat(e.target.value) || 0
                            })}
                            className="w-16 font-black text-slate-900 text-xs text-right outline-none"
                          />
                          <span className="text-xs font-bold text-slate-400">{item.unit || 'kg'}</span>
                        </div>

                        <span className="font-black text-sm text-emerald-700 min-w-[70px] text-right block">
                          R$ {currentSubtotal.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-slate-900 text-white p-5 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 block">Novo Total Recalculado:</span>
                <span className="text-2xl font-black text-emerald-400">
                  R$ {selectedSaleForWeighing.items.reduce((acc, item, idx) => {
                    const q = weighingInputs[idx] !== undefined ? weighingInputs[idx] : item.quantity;
                    return acc + (q * (item.price || 0));
                  }, 0).toFixed(2)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsWeighingModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveWeighing}
                  disabled={saving}
                  className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Confirmar Pesagem'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
