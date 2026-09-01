import React, { useState, useEffect, useMemo } from 'react';
import { 
  ThirdPartyPurchase, 
  ThirdPartyPurchaseItem, 
  ThirdPartyStockItem, 
  ThirdPartyPreset, 
  Sale, 
  ProduceCatalogItem 
} from '../types';
import { 
  Plus, 
  Search, 
  Calendar, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  Trash2, 
  Edit2, 
  Layers, 
  AlertCircle, 
  Package, 
  Truck, 
  SlidersHorizontal, 
  X, 
  Save, 
  Check, 
  RotateCcw, 
  Store, 
  ArrowUpRight, 
  ArrowDownRight, 
  TrendingUp, 
  Building2, 
  Filter, 
  FileText, 
  Share2, 
  Printer, 
  Copy,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  setDoc 
} from 'firebase/firestore';
import { db } from '../firebase';
import { normalizeProductName, getCanonicalProductName } from '../productUtils';
import { handleFirestoreError, OperationType, cn } from '../App';
import { DEFAULT_POPULAR_THIRD_PARTY_ITEMS } from './KgSalesManager';

interface ThirdPartyPurchasesProps {
  sales: Sale[];
  produceCatalog?: ProduceCatalogItem[];
  thirdPartyPresets?: ThirdPartyPreset[];
  presets?: ThirdPartyPreset[];
  onUpdatePresets?: (presets: ThirdPartyPreset[]) => void;
}

export default function ThirdPartyPurchases({
  sales,
  produceCatalog = [],
  thirdPartyPresets,
  presets,
  onUpdatePresets
}: ThirdPartyPurchasesProps) {
  const currentPresets = thirdPartyPresets || presets || DEFAULT_POPULAR_THIRD_PARTY_ITEMS;
  const handlePresetsChange = onUpdatePresets || (() => {});
  // Aba ativa: 'purchases' (Pedidos de Compra) | 'stock' (Estoque de Terceiros) | 'presets' (Catálogo de Preços)
  const [subTab, setSubTab] = useState<'purchases' | 'stock' | 'presets'>('purchases');

  // Estado das compras no Firestore
  const [purchases, setPurchases] = useState<ThirdPartyPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'this_month' | 'last_30_days'>('all');

  // Modais
  const [isNewPurchaseModalOpen, setIsNewPurchaseModalOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<ThirdPartyPurchase | null>(null);
  const [purchaseToDelete, setPurchaseToDelete] = useState<ThirdPartyPurchase | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isMarkingPaidModalOpen, setIsMarkingPaidModalOpen] = useState<ThirdPartyPurchase | null>(null);
  const [isStockAdjustmentModalOpen, setIsStockAdjustmentModalOpen] = useState<{ productName: string; unit: string; currentStock: number } | null>(null);
  const [adjustmentValue, setAdjustmentValue] = useState<string>('');
  const [adjustmentReason, setAdjustmentReason] = useState<string>('');

  // Formulário de Nova / Edição de Compra
  const [formSupplier, setFormSupplier] = useState('');
  const [formPurchaseDate, setFormPurchaseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formDueDate, setFormDueDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formPaymentStatus, setFormPaymentStatus] = useState<'paid' | 'pending'>('paid');
  const [formPaymentMethod, setFormPaymentMethod] = useState('Pix');
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState<ThirdPartyPurchaseItem[]>([]);

  // Item sendo adicionado ao formulário de compra
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [customItemName, setCustomItemName] = useState('');
  const [itemQty, setItemQty] = useState<string>('10');
  const [itemUnit, setItemUnit] = useState<string>('kg');
  const [itemUnitCost, setItemUnitCost] = useState<string>('5.00');

  // Pagamento rápido
  const [payMethod, setPayMethod] = useState('Pix');
  const [payDate, setPayDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Feedback e Salvamento
  const [saving, setSaving] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Estados do Gerenciador de Predefinições
  const [presetSearch, setPresetSearch] = useState('');
  const [editingPreset, setEditingPreset] = useState<ThirdPartyPreset | null>(null);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetCost, setNewPresetCost] = useState<string>('');
  const [newPresetPrice, setNewPresetPrice] = useState<string>('');
  const [newPresetUnit, setNewPresetUnit] = useState('kg');
  const [isAddingPreset, setIsAddingPreset] = useState(false);

  // Carregar compras do Firestore em tempo real
  useEffect(() => {
    const q = query(collection(db, 'third_party_purchases'), orderBy('purchaseDate', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data
        } as ThirdPartyPurchase;
      });
      setPurchases(docs);
      setLoading(false);
    }, (err) => {
      console.error("Erro ao carregar compras de terceiros:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Fornecedores anteriores para autocompletação rápida
  const previousSuppliers = useMemo(() => {
    const set = new Set<string>();
    purchases.forEach(p => {
      if (p.supplierName && p.supplierName.trim()) {
        set.add(p.supplierName.trim());
      }
    });
    return Array.from(set);
  }, [purchases]);

  // Lista unificada de sugestões de produtos para compra
  const availableProductOptions = useMemo(() => {
    const map = new Map<string, { name: string; defaultCost: number; defaultPrice: number; unit: string }>();

    // 1. Predefinições salvas
    currentPresets.forEach(p => {
      map.set(normalizeProductName(p.name), {
        name: p.name,
        defaultCost: p.defaultCost || 0,
        defaultPrice: p.defaultPrice || 0,
        unit: p.unit || 'kg'
      });
    });

    // 2. Itens do catálogo de produtos
    produceCatalog.forEach(c => {
      const key = normalizeProductName(c.name);
      if (!map.has(key)) {
        map.set(key, {
          name: c.name,
          defaultCost: 0,
          defaultPrice: c.defaultPrice || 0,
          unit: c.unit || 'kg'
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [currentPresets, produceCatalog]);

  // CÁLCULO DINÂMICO DO ESTOQUE DE TERCEIROS (REVENDA)
  const thirdPartyStock = useMemo(() => {
    const stockMap = new Map<string, ThirdPartyStockItem>();

    // 1. Somar todas as compras efetuadas
    purchases.forEach(purchase => {
      const pDate = purchase.purchaseDate?.toDate ? purchase.purchaseDate.toDate() : (purchase.purchaseDate ? new Date(purchase.purchaseDate) : null);
      
      (purchase.items || []).forEach(item => {
        const canonical = getCanonicalProductName(item.name);
        const key = `${normalizeProductName(canonical)}_${item.unit || 'kg'}`;

        if (!stockMap.has(key)) {
          stockMap.set(key, {
            name: item.name,
            canonicalName: canonical,
            unit: item.unit || 'kg',
            totalPurchased: 0,
            totalSold: 0,
            currentStock: 0,
            latestCost: item.unitCost || 0,
            averageCost: item.unitCost || 0,
            lastSupplier: purchase.supplierName,
            lastPurchaseDate: pDate,
            purchaseCount: 0
          });
        }

        const current = stockMap.get(key)!;
        const prevTotalQty = current.totalPurchased;
        const newTotalQty = prevTotalQty + item.quantity;
        
        // Custo médio ponderado
        const prevTotalValue = prevTotalQty * current.averageCost;
        const newTotalValue = prevTotalValue + (item.quantity * item.unitCost);
        const newAverageCost = newTotalQty > 0 ? (newTotalValue / newTotalQty) : item.unitCost;

        current.totalPurchased = newTotalQty;
        current.averageCost = Number(newAverageCost.toFixed(2));
        current.latestCost = item.unitCost;
        current.purchaseCount += 1;
        
        if (purchase.supplierName) current.lastSupplier = purchase.supplierName;
        if (pDate && (!current.lastPurchaseDate || pDate > current.lastPurchaseDate)) {
          current.lastPurchaseDate = pDate;
        }
      });
    });

    // 2. Deduzir as vendas realizadas que consumiram itens de terceiros
    (sales || []).forEach(sale => {
      if (sale.status === 'cancelled') return; // Vendas canceladas não consomem estoque

      (sale.items || []).forEach(item => {
        // Verifica se é de terceiros
        const isThirdParty = item.source === 'third_party' || 
          (item.name && item.name.toLowerCase().includes('revenda')) || 
          (item.name && item.name.toLowerCase().includes('(terceiro)'));

        if (isThirdParty) {
          const canonical = getCanonicalProductName(item.name);
          const key = `${normalizeProductName(canonical)}_${item.unit || 'kg'}`;

          if (!stockMap.has(key)) {
            // Caso tenha sido vendido sem registro prévio de compra
            stockMap.set(key, {
              name: item.name,
              canonicalName: canonical,
              unit: item.unit || 'kg',
              totalPurchased: 0,
              totalSold: 0,
              currentStock: 0,
              latestCost: item.cost || item.estimatedCost || 0,
              averageCost: item.cost || item.estimatedCost || 0,
              purchaseCount: 0
            });
          }

          const current = stockMap.get(key)!;
          current.totalSold += (item.actualWeightedQty || item.quantity || 0);
        }
      });
    });

    // 3. Calcular saldo atual
    stockMap.forEach(item => {
      item.currentStock = Number((item.totalPurchased - item.totalSold).toFixed(2));
    });

    return Array.from(stockMap.values()).sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, 'pt-BR'));
  }, [purchases, sales]);

  // Indicadores de Compras e Estoque
  const metrics = useMemo(() => {
    let pendingToPay = 0;
    let paidTotal = 0;
    let totalPurchasesCount = purchases.length;
    let pendingPurchasesCount = 0;

    purchases.forEach(p => {
      if (p.paymentStatus === 'pending') {
        pendingToPay += (p.totalAmount || 0);
        pendingPurchasesCount += 1;
      } else {
        paidTotal += (p.totalAmount || 0);
      }
    });

    // Valor estimado total do estoque disponível
    const stockTotalValue = thirdPartyStock.reduce((acc, item) => {
      const stock = Math.max(0, item.currentStock);
      return acc + (stock * item.latestCost);
    }, 0);

    const availableItemsCount = thirdPartyStock.filter(i => i.currentStock > 0).length;

    return {
      pendingToPay,
      paidTotal,
      totalPurchasesCount,
      pendingPurchasesCount,
      stockTotalValue,
      availableItemsCount
    };
  }, [purchases, thirdPartyStock]);

  // Filtros de Compras
  const filteredPurchases = useMemo(() => {
    return purchases.filter(p => {
      // Filtro de status
      if (statusFilter !== 'all' && p.paymentStatus !== statusFilter) return false;

      // Filtro de busca
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchSupplier = (p.supplierName || '').toLowerCase().includes(term);
        const matchNumber = (p.purchaseNumber || '').toLowerCase().includes(term);
        const matchItems = p.items.some(i => i.name.toLowerCase().includes(term));
        if (!matchSupplier && !matchNumber && !matchItems) return false;
      }

      return true;
    });
  }, [purchases, statusFilter, searchTerm]);

  // Resetar e abrir modal de nova compra
  const handleOpenNewPurchase = () => {
    setEditingPurchase(null);
    setFormSupplier('');
    setFormPurchaseDate(format(new Date(), 'yyyy-MM-dd'));
    setFormDueDate(format(new Date(), 'yyyy-MM-dd'));
    setFormPaymentStatus('paid');
    setFormPaymentMethod('Pix');
    setFormNotes('');
    setFormItems([]);
    setSelectedPresetId('');
    setCustomItemName('');
    setItemQty('10');
    setItemUnit('kg');
    setItemUnitCost('5.00');
    setFormError(null);
    setIsNewPurchaseModalOpen(true);
  };

  // Abrir modal de edição de compra
  const handleOpenEditPurchase = (purchase: ThirdPartyPurchase) => {
    setEditingPurchase(purchase);
    setFormSupplier(purchase.supplierName || '');
    
    const pDate = purchase.purchaseDate?.toDate 
      ? format(purchase.purchaseDate.toDate(), 'yyyy-MM-dd') 
      : (purchase.purchaseDate ? format(new Date(purchase.purchaseDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
    setFormPurchaseDate(pDate);

    const dDate = purchase.dueDate?.toDate 
      ? format(purchase.dueDate.toDate(), 'yyyy-MM-dd') 
      : (purchase.dueDate ? format(new Date(purchase.dueDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
    setFormDueDate(dDate);

    setFormPaymentStatus(purchase.paymentStatus || 'paid');
    setFormPaymentMethod(purchase.paymentMethod || 'Pix');
    setFormNotes(purchase.notes || '');
    setFormItems([...(purchase.items || [])]);
    setFormError(null);
    setIsNewPurchaseModalOpen(true);
  };

  // Adicionar item à lista da compra atual
  const handleAddItemToForm = () => {
    let nameToAdd = customItemName.trim();
    if (selectedPresetId) {
      const preset = availableProductOptions.find(p => p.name === selectedPresetId);
      if (preset) nameToAdd = preset.name;
    }

    if (!nameToAdd) {
      setFormError('Por favor, informe ou selecione o nome do produto.');
      return;
    }

    const qty = parseFloat(itemQty) || 0;
    const cost = parseFloat(itemUnitCost) || 0;

    if (qty <= 0) {
      setFormError('A quantidade comprada deve ser maior que zero.');
      return;
    }

    if (cost < 0) {
      setFormError('O custo unitário não pode ser negativo.');
      return;
    }

    const newItem: ThirdPartyPurchaseItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: nameToAdd,
      quantity: qty,
      unit: itemUnit,
      unitCost: cost,
      totalCost: Number((qty * cost).toFixed(2))
    };

    setFormItems(prev => [...prev, newItem]);
    setCustomItemName('');
    setSelectedPresetId('');
    setItemQty('10');
    setFormError(null);
  };

  const handleRemoveItemFromForm = (index: number) => {
    setFormItems(prev => prev.filter((_, i) => i !== index));
  };

  // Total da compra em edição
  const formTotalAmount = useMemo(() => {
    let total = (formItems || []).reduce((acc, item) => acc + (item.totalCost || 0), 0);
    // Se o formulário não tem itens adicionados na lista, mas tem valores preenchidos nos campos
    if (formItems.length === 0) {
      const pendingQty = parseFloat(itemQty) || 0;
      const pendingCost = parseFloat(itemUnitCost) || 0;
      if (pendingQty > 0 && (customItemName.trim() || selectedPresetId)) {
        total = Number((pendingQty * pendingCost).toFixed(2));
      }
    }
    return total;
  }, [formItems, itemQty, itemUnitCost, customItemName, selectedPresetId]);

  // Salvar Pedido de Compra no Firestore
  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const supplierTrimmed = formSupplier.trim();
    if (!supplierTrimmed) {
      setFormError('Por favor, informe o nome do fornecedor (Ex: Ceasa, Produtor João, etc).');
      return;
    }

    let itemsToSave = [...formItems];

    // Se a lista estiver vazia ou o usuário preencheu o campo rápido de produto sem clicar no '+', incluir automaticamente
    let pendingName = customItemName.trim();
    if (selectedPresetId) {
      const preset = availableProductOptions.find(p => p.name === selectedPresetId);
      if (preset) pendingName = preset.name;
    }
    const pendingQty = parseFloat(itemQty) || 0;
    const pendingCost = parseFloat(itemUnitCost) || 0;

    if (pendingName && pendingQty > 0) {
      itemsToSave.push({
        id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name: pendingName,
        quantity: pendingQty,
        unit: itemUnit || 'kg',
        unitCost: pendingCost,
        totalCost: Number((pendingQty * pendingCost).toFixed(2))
      });
    }

    if (itemsToSave.length === 0) {
      setFormError('Adicione ao menos um produto a este pedido de compra.');
      return;
    }

    setSaving(true);

    try {
      const purchaseDateObj = formPurchaseDate ? new Date(formPurchaseDate + 'T12:00:00') : new Date();
      const dueDateObj = formDueDate ? new Date(formDueDate + 'T12:00:00') : new Date();
      const purchaseNumber = editingPurchase?.purchaseNumber || `CP-${Date.now().toString().slice(-6)}`;
      const totalSum = itemsToSave.reduce((acc, item) => acc + (item.totalCost || 0), 0);

      const purchaseData: any = {
        purchaseNumber,
        supplierName: supplierTrimmed,
        purchaseDate: purchaseDateObj,
        dueDate: dueDateObj,
        paymentStatus: formPaymentStatus,
        paymentMethod: formPaymentMethod || 'Pix',
        notes: (formNotes || '').trim(),
        items: itemsToSave,
        totalAmount: Number(totalSum.toFixed(2)),
        updatedAt: serverTimestamp()
      };

      if (formPaymentStatus === 'paid') {
        purchaseData.paymentDate = purchaseDateObj;
      }

      let purchaseId = editingPurchase?.id;

      if (editingPurchase) {
        await updateDoc(doc(db, 'third_party_purchases', editingPurchase.id), purchaseData);
      } else {
        purchaseData.createdAt = serverTimestamp();
        const docRef = await addDoc(collection(db, 'third_party_purchases'), purchaseData);
        purchaseId = docRef.id;
      }

      // Sincronizar com o Financeiro (Despesa) se estiver PAGO
      if (formPaymentStatus === 'paid' && purchaseId) {
        try {
          const transId = `purchase_${purchaseId}`;
          await setDoc(doc(db, 'transactions', transId), {
            type: 'expense',
            amount: Number(totalSum.toFixed(2)),
            description: `Compra de Terceiros / Revenda (${supplierTrimmed}) - ${purchaseNumber}`,
            category: 'Compra de Insumos',
            date: purchaseDateObj,
            relatedPurchaseId: purchaseId
          });
        } catch (tErr) {
          console.warn("Aviso ao sincronizar compra com financeiro:", tErr);
        }
      } else if (editingPurchase && editingPurchase.paymentStatus === 'paid' && formPaymentStatus === 'pending') {
        // Se mudou de pago para pendente, exclui a despesa do financeiro
        try {
          await deleteDoc(doc(db, 'transactions', `purchase_${editingPurchase.id}`));
        } catch (e) {
          console.warn("Transação não encontrada para deletar", e);
        }
      }

      setIsNewPurchaseModalOpen(false);
      setEditingPurchase(null);
      setCustomItemName('');
      setSelectedPresetId('');
      setFormItems([]);
      setFormError(null);
      setFeedbackMsg('Pedido de compra salvo com sucesso!');
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: any) {
      console.error('Erro ao salvar pedido de compra:', err);
      setFormError('Erro ao salvar compra: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  // Efetuar / Confirmar Pagamento de uma compra pendente
  const handleConfirmPayment = async () => {
    if (!isMarkingPaidModalOpen) return;
    setSaving(true);

    try {
      const p = isMarkingPaidModalOpen;
      const paymentDateObj = payDate ? new Date(payDate + 'T12:00:00') : new Date();

      // 1. Atualizar a compra
      await updateDoc(doc(db, 'third_party_purchases', p.id), {
        paymentStatus: 'paid',
        paymentMethod: payMethod,
        paymentDate: paymentDateObj,
        updatedAt: serverTimestamp()
      });

      // 2. Lançar no Financeiro
      try {
        const transId = `purchase_${p.id}`;
        await setDoc(doc(db, 'transactions', transId), {
          type: 'expense',
          amount: p.totalAmount,
          description: `Pagamento Compra Terceiros (${p.supplierName}) - ${p.purchaseNumber || 'S/N'}`,
          category: 'Compra de Insumos',
          date: paymentDateObj,
          relatedPurchaseId: p.id
        });
      } catch (tErr) {
        console.warn("Aviso ao registrar transação:", tErr);
      }

      setIsMarkingPaidModalOpen(null);
      setFeedbackMsg(`Pagamento de R$ ${p.totalAmount.toFixed(2)} confirmado e lançado no Financeiro!`);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: any) {
      console.error('Erro ao confirmar pagamento:', err);
      setFeedbackMsg('Erro ao confirmar pagamento: ' + err.message);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  // Excluir pedido de compra confirmado pelo modal
  const handleDeletePurchaseConfirmed = async () => {
    if (!purchaseToDelete) return;
    setSaving(true);
    const id = purchaseToDelete.id;

    try {
      await deleteDoc(doc(db, 'third_party_purchases', id));
      try {
        await deleteDoc(doc(db, 'transactions', `purchase_${id}`));
      } catch (e) {
        // Ignora se não existir
      }
      setPurchaseToDelete(null);
      setFeedbackMsg('Pedido de compra excluído com sucesso.');
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch (err: any) {
      console.error('Erro ao excluir compra:', err);
      setFeedbackMsg('Erro ao excluir compra: ' + (err.message || 'Erro desconhecido'));
      setTimeout(() => setFeedbackMsg(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  // Compartilhar / Copiar Comprovante da Compra
  const handleCopyPurchaseReceipt = (purchase: ThirdPartyPurchase) => {
    const pDate = purchase.purchaseDate?.toDate 
      ? format(purchase.purchaseDate.toDate(), 'dd/MM/yyyy') 
      : 'Hoje';

    let text = `📦 *PEDIDO DE COMPRA DE TERCEIROS* - ${purchase.purchaseNumber || ''}\n`;
    text += `🏢 Fornecedor: *${purchase.supplierName}*\n`;
    text += `📅 Data: ${pDate}\n`;
    text += `💳 Status: *${purchase.paymentStatus === 'paid' ? '✅ PAGO' : '⏳ A PAGAR / PENDENTE'}*\n`;
    if (purchase.paymentStatus === 'paid' && purchase.paymentMethod) {
      text += `💰 Forma de Pagamento: ${purchase.paymentMethod}\n`;
    }
    text += `\n📋 *ITENS COMPRADOS:*\n`;
    (purchase.items || []).forEach(i => {
      text += `▪️ ${i.quantity} ${i.unit} - ${i.name} (R$ ${i.unitCost.toFixed(2)}/${i.unit}) = *R$ ${i.totalCost.toFixed(2)}*\n`;
    });
    text += `\n💵 *TOTAL DA COMPRA: R$ ${purchase.totalAmount.toFixed(2)}*\n`;
    if (purchase.notes) {
      text += `\n📝 Obs: ${purchase.notes}\n`;
    }

    navigator.clipboard.writeText(text);
    setCopiedId(purchase.id);
    setTimeout(() => setCopiedId(null), 3000);
  };

  // Salvar / Adicionar Predefinição de Produto
  const handleSavePreset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetName.trim()) return;

    const costNum = parseFloat(newPresetCost) || 0;
    const priceNum = parseFloat(newPresetPrice) || 0;

    if (editingPreset) {
      const updated = currentPresets.map(p => 
        p.id === editingPreset.id 
          ? { ...p, name: newPresetName.trim(), defaultCost: costNum, defaultPrice: priceNum, unit: newPresetUnit }
          : p
      );
      handlePresetsChange(updated);
      setEditingPreset(null);
    } else {
      const newP: ThirdPartyPreset = {
        id: `tp_custom_${Date.now()}`,
        name: newPresetName.trim(),
        defaultCost: costNum,
        defaultPrice: priceNum,
        unit: newPresetUnit
      };
      handlePresetsChange([...currentPresets, newP]);
      setIsAddingPreset(false);
    }

    setNewPresetName('');
    setNewPresetCost('');
    setNewPresetPrice('');
    setNewPresetUnit('kg');
    setFeedbackMsg('Predefinição salva com sucesso!');
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleDeletePreset = (id: string) => {
    handlePresetsChange(currentPresets.filter(p => p.id !== id));
    setFeedbackMsg('Produto removido das predefinições.');
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleResetDefaultPresets = () => {
    handlePresetsChange(DEFAULT_POPULAR_THIRD_PARTY_ITEMS);
    setFeedbackMsg('Predefinições restauradas para o padrão de fábrica.');
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {feedbackMsg && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-5">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <span className="text-sm font-bold">{feedbackMsg}</span>
        </div>
      )}

      {/* CABEÇALHO & CARDS RESUMO */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6 md:p-8 rounded-[2rem] shadow-xl border border-slate-700">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                <Store size={14} /> Compras & Revenda
              </span>
              <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                Controle separado de compras do Ceasa/Terceiros e Estoque de Revenda
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white">
              Central de Compras & Estoque de Terceiros
            </h2>
            <p className="text-slate-300 text-xs md:text-sm mt-1 max-w-2xl font-medium">
              Lance suas compras de mercadorias de terceiros, controle o que já foi <b>pago</b> ou está <b>a pagar</b>, e abasteça seu estoque para vender junto com a sua produção.
            </p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={handleOpenNewPurchase}
              className="flex-1 sm:flex-initial bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-6 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <Plus size={18} />
              + Nova Compra de Terceiros
            </button>
          </div>
        </div>

        {/* 4 Cards de Métricas Principais */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mt-6 pt-6 border-t border-slate-700/60">
          <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700/70">
            <div className="flex items-center justify-between">
              <span className="text-[10px] md:text-xs font-bold text-amber-400 uppercase tracking-wider">A Pagar (Pendente)</span>
              <Clock size={16} className="text-amber-400" />
            </div>
            <p className="text-xl md:text-2xl font-black text-amber-300 mt-1">
              R$ {metrics.pendingToPay.toFixed(2)}
            </p>
            <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
              {metrics.pendingPurchasesCount} compra(s) em aberto
            </span>
          </div>

          <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700/70">
            <div className="flex items-center justify-between">
              <span className="text-[10px] md:text-xs font-bold text-emerald-400 uppercase tracking-wider">Total Pago</span>
              <CheckCircle2 size={16} className="text-emerald-400" />
            </div>
            <p className="text-xl md:text-2xl font-black text-emerald-300 mt-1">
              R$ {metrics.paidTotal.toFixed(2)}
            </p>
            <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
              Lançado no Financeiro
            </span>
          </div>

          <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700/70">
            <div className="flex items-center justify-between">
              <span className="text-[10px] md:text-xs font-bold text-blue-400 uppercase tracking-wider">Valor em Estoque</span>
              <Package size={16} className="text-blue-400" />
            </div>
            <p className="text-xl md:text-2xl font-black text-blue-300 mt-1">
              R$ {metrics.stockTotalValue.toFixed(2)}
            </p>
            <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
              Mercadoria disponível
            </span>
          </div>

          <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700/70">
            <div className="flex items-center justify-between">
              <span className="text-[10px] md:text-xs font-bold text-slate-300 uppercase tracking-wider">Produtos em Estoque</span>
              <Layers size={16} className="text-slate-300" />
            </div>
            <p className="text-xl md:text-2xl font-black text-white mt-1">
              {metrics.availableItemsCount} <span className="text-sm font-bold text-slate-400">itens</span>
            </p>
            <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
              Prontos para venda
            </span>
          </div>
        </div>
      </div>

      {/* ABAS SECUNDÁRIAS (Sub-Tabs) */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200">
          <button
            onClick={() => setSubTab('purchases')}
            className={cn(
              "px-4 py-2.5 rounded-xl font-black text-xs md:text-sm flex items-center gap-2 transition-all cursor-pointer",
              subTab === 'purchases' 
                ? "bg-white text-slate-900 shadow-sm" 
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            <Truck size={16} className={subTab === 'purchases' ? "text-emerald-600" : "text-slate-400"} />
            Pedidos de Compra ({purchases.length})
            {metrics.pendingPurchasesCount > 0 && (
              <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.2 rounded-full font-black">
                {metrics.pendingPurchasesCount} a pagar
              </span>
            )}
          </button>

          <button
            onClick={() => setSubTab('stock')}
            className={cn(
              "px-4 py-2.5 rounded-xl font-black text-xs md:text-sm flex items-center gap-2 transition-all cursor-pointer",
              subTab === 'stock' 
                ? "bg-white text-slate-900 shadow-sm" 
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            <Package size={16} className={subTab === 'stock' ? "text-emerald-600" : "text-slate-400"} />
            Estoque de Terceiros ({thirdPartyStock.length})
          </button>

          <button
            onClick={() => setSubTab('presets')}
            className={cn(
              "px-4 py-2.5 rounded-xl font-black text-xs md:text-sm flex items-center gap-2 transition-all cursor-pointer",
              subTab === 'presets' 
                ? "bg-white text-slate-900 shadow-sm" 
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            <SlidersHorizontal size={16} className={subTab === 'presets' ? "text-emerald-600" : "text-slate-400"} />
            Predefinições & Custos ({currentPresets.length})
          </button>
        </div>

        {/* Busca rápida */}
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={subTab === 'purchases' ? "Buscar fornecedor ou item..." : "Buscar produto no estoque..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ABA 1: LISTA DE PEDIDOS DE COMPRA DE TERCEIROS */}
      {/* ========================================================================= */}
      {subTab === 'purchases' && (
        <div className="space-y-4">
          {/* Filtros de Status */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">Status:</span>
              <button
                onClick={() => setStatusFilter('all')}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer",
                  statusFilter === 'all' ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                Todos ({purchases.length})
              </button>
              <button
                onClick={() => setStatusFilter('pending')}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5",
                  statusFilter === 'pending' ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100"
                )}
              >
                <Clock size={12} /> A Pagar ({purchases.filter(p => p.paymentStatus === 'pending').length})
              </button>
              <button
                onClick={() => setStatusFilter('paid')}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5",
                  statusFilter === 'paid' ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                )}
              >
                <CheckCircle2 size={12} /> Pagos ({purchases.filter(p => p.paymentStatus === 'paid').length})
              </button>
            </div>
          </div>

          {loading ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 text-slate-400">
              <RefreshCw className="mx-auto animate-spin mb-3 text-emerald-600" size={32} />
              <p className="font-bold">Carregando pedidos de compra...</p>
            </div>
          ) : filteredPurchases.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 text-slate-400 shadow-sm">
              <Truck className="mx-auto text-slate-300 mb-3" size={48} />
              <p className="font-black text-slate-700 text-base">Nenhum pedido de compra encontrado</p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Registre suas compras de verduras, legumes e frutas de terceiros para controlar os pagamentos e alimentar seu estoque de revenda.
              </p>
              <button
                onClick={handleOpenNewPurchase}
                className="mt-4 inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-100"
              >
                <Plus size={16} /> Lançar Primeira Compra
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredPurchases.map(purchase => {
                const isPaid = purchase.paymentStatus === 'paid';
                const pDate = purchase.purchaseDate?.toDate 
                  ? format(purchase.purchaseDate.toDate(), "dd/MM/yyyy", { locale: ptBR }) 
                  : 'Hoje';
                const dDate = purchase.dueDate?.toDate 
                  ? format(purchase.dueDate.toDate(), "dd/MM/yyyy", { locale: ptBR }) 
                  : null;

                return (
                  <div
                    key={purchase.id}
                    className={cn(
                      "bg-white rounded-2xl border p-5 md:p-6 shadow-sm transition-all hover:shadow-md",
                      isPaid ? "border-slate-200" : "border-amber-200 bg-amber-50/20"
                    )}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Lado Esquerdo: Info do Fornecedor e Status */}
                      <div className="flex items-start gap-4">
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border",
                          isPaid ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-amber-100 text-amber-700 border-amber-300"
                        )}>
                          <Building2 size={24} />
                        </div>

                        <div>
                          <div className="flex items-center flex-wrap gap-2">
                            <h4 className="text-base md:text-lg font-black text-slate-900">{purchase.supplierName}</h4>
                            <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-bold">
                              {purchase.purchaseNumber || 'S/N'}
                            </span>
                            <span className={cn(
                              "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1",
                              isPaid 
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-200" 
                                : "bg-amber-100 text-amber-900 border border-amber-300"
                            )}>
                              {isPaid ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                              {isPaid ? 'PAGO' : 'A PAGAR'}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
                            <span className="flex items-center gap-1">
                              <Calendar size={12} className="text-slate-400" />
                              Data da Compra: <b>{pDate}</b>
                            </span>
                            {!isPaid && dDate && (
                              <span className="flex items-center gap-1 text-amber-700 font-bold">
                                <Clock size={12} />
                                Vencimento: <b>{dDate}</b>
                              </span>
                            )}
                            {isPaid && purchase.paymentMethod && (
                              <span className="text-emerald-700 font-bold">
                                Forma: {purchase.paymentMethod}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Centro: Itens Comprados */}
                      <div className="flex-1 lg:px-6">
                        <div className="flex flex-wrap gap-1.5">
                          {purchase.items.map((item, i) => (
                            <span
                              key={i}
                              className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-slate-200/60"
                            >
                              <b className="text-slate-900">{item.quantity} {item.unit}</b> {item.name}
                              <span className="text-[10px] text-slate-400 font-medium">
                                (R$ {item.unitCost.toFixed(2)}/{item.unit})
                              </span>
                            </span>
                          ))}
                        </div>
                        {purchase.notes && (
                          <p className="text-[11px] text-slate-500 italic mt-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <b>Obs:</b> {purchase.notes}
                          </p>
                        )}
                      </div>

                      {/* Lado Direito: Total e Ações */}
                      <div className="flex items-center justify-between lg:justify-end gap-4 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                        <div className="text-left lg:text-right">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total da Compra</span>
                          <span className="text-xl font-black text-slate-900 block">
                            R$ {purchase.totalAmount.toFixed(2)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {!isPaid && (
                            <button
                              onClick={() => {
                                setIsMarkingPaidModalOpen(purchase);
                                setPayMethod(purchase.paymentMethod || 'Pix');
                                setPayDate(format(new Date(), 'yyyy-MM-dd'));
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                              title="Marcar como Pago e Lançar no Financeiro"
                            >
                              <CheckCircle2 size={14} />
                              Marcar Pago
                            </button>
                          )}

                          <button
                            onClick={() => handleCopyPurchaseReceipt(purchase)}
                            className="p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-xl transition-all cursor-pointer"
                            title="Copiar / Compartilhar Pedido"
                          >
                            {copiedId === purchase.id ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                          </button>

                          <button
                            onClick={() => handleOpenEditPurchase(purchase)}
                            className="p-2 text-slate-500 hover:bg-slate-100 hover:text-emerald-700 rounded-xl transition-all cursor-pointer"
                            title="Editar Compra"
                          >
                            <Edit2 size={16} />
                          </button>

                          <button
                            onClick={() => setPurchaseToDelete(purchase)}
                            className="p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all cursor-pointer"
                            title="Excluir Compra"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 2: PAINEL DE ESTOQUE DE TERCEIROS (REVENDA) */}
      {/* ========================================================================= */}
      {subTab === 'stock' && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-start gap-3">
            <Package size={20} className="text-emerald-700 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-950 leading-relaxed font-medium">
              <strong className="font-black text-emerald-900 block text-sm mb-0.5">Estoque Alimentado Automaticamente</strong>
              Este estoque é gerado a partir dos seus <b>Pedidos de Compra de Terceiros</b>. Toda vez que você vende um produto marcando a origem como <b>"Estoque de Terceiros"</b> no Pedido do Cliente, a quantidade é deduzida daqui automaticamente, mantendo seu inventário de revenda 100% atualizado!
            </div>
          </div>

          {thirdPartyStock.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 text-slate-400 shadow-sm">
              <Package className="mx-auto text-slate-300 mb-3" size={48} />
              <p className="font-black text-slate-700 text-base">Seu Estoque de Terceiros está vazio</p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Assim que você registrar um pedido de compra, os produtos aparecerão aqui com o saldo disponível para venda.
              </p>
              <button
                onClick={handleOpenNewPurchase}
                className="mt-4 inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all"
              >
                <Plus size={16} /> Lançar Compra de Terceiros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {thirdPartyStock
                .filter(item => {
                  if (!searchTerm.trim()) return true;
                  const term = searchTerm.toLowerCase();
                  return item.name.toLowerCase().includes(term) || item.canonicalName.toLowerCase().includes(term);
                })
                .map(item => {
                  const isAvailable = item.currentStock > 0;
                  const isLow = item.currentStock > 0 && item.currentStock <= 5;
                  const isOut = item.currentStock <= 0;

                  return (
                    <div
                      key={`${item.canonicalName}_${item.unit}`}
                      className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div>
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[9px] font-black uppercase tracking-wider">
                              Revenda
                            </span>
                            <h4 className="text-base font-black text-slate-900 mt-1">{item.name}</h4>
                          </div>

                          <span className={cn(
                            "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0",
                            isOut ? "bg-rose-100 text-rose-800" : (isLow ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800")
                          )}>
                            {isOut ? 'Esgotado' : (isLow ? 'Estoque Baixo' : 'Em Estoque')}
                          </span>
                        </div>

                        {/* Saldo Disponível Grande */}
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 my-3">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Saldo Disponível</span>
                          <div className="flex items-baseline gap-1.5 mt-0.5">
                            <span className={cn(
                              "text-3xl font-black",
                              isOut ? "text-slate-400" : "text-emerald-700"
                            )}>
                              {item.currentStock}
                            </span>
                            <span className="text-sm font-bold text-slate-500">{item.unit}</span>
                          </div>
                        </div>

                        {/* Detalhes de Entradas, Saídas e Custos */}
                        <div className="space-y-1.5 text-xs text-slate-600">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Total Comprado:</span>
                            <span className="font-bold text-slate-800">{item.totalPurchased} {item.unit}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Já Vendido:</span>
                            <span className="font-bold text-slate-800">{item.totalSold} {item.unit}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Custo de Compra (Último):</span>
                            <span className="font-bold text-emerald-600">R$ {item.latestCost.toFixed(2)} / {item.unit}</span>
                          </div>
                          {item.lastSupplier && (
                            <div className="flex justify-between text-[11px] pt-1 border-t border-slate-100">
                              <span className="text-slate-400">Último Fornecedor:</span>
                              <span className="font-semibold text-slate-700 truncate max-w-[140px]">{item.lastSupplier}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">
                          {item.purchaseCount} compra(s) registradas
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setCustomItemName(item.name);
                            setSelectedPresetId(item.name);
                            setItemUnit(item.unit);
                            setItemUnitCost(item.latestCost.toString());
                            handleOpenNewPurchase();
                          }}
                          className="text-emerald-700 hover:text-emerald-800 font-bold hover:underline cursor-pointer"
                        >
                          + Comprar Mais
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 3: PREDEFINIÇÕES & CATÁLOGO DE PRODUTOS DE TERCEIROS */}
      {/* ========================================================================= */}
      {subTab === 'presets' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              <h3 className="text-base font-black text-slate-900">Catálogo de Predefinições de Revenda</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure os produtos que você costuma comprar de terceiros com os custos e preços sugeridos padrão.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetDefaultPresets}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                title="Restaurar lista de produtos padrão"
              >
                <RotateCcw size={14} /> Restaurar Padrões
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingPreset(null);
                  setNewPresetName('');
                  setNewPresetCost('');
                  setNewPresetPrice('');
                  setNewPresetUnit('kg');
                  setIsAddingPreset(true);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Plus size={14} /> + Novo Produto Pré-Salvo
              </button>
            </div>
          </div>

          {/* Grid de Predefinições */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {currentPresets
              .filter(p => !presetSearch.trim() || p.name.toLowerCase().includes(presetSearch.toLowerCase()))
              .map(preset => (
                <div
                  key={preset.id}
                  className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-black text-slate-800">{preset.name}</h4>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{preset.unit}</span>
                    </div>

                    <div className="mt-3 space-y-1.5 text-xs">
                      <div className="flex justify-between bg-amber-50/60 p-2 rounded-lg border border-amber-100/60">
                        <span className="text-amber-800 font-medium">Custo Compra:</span>
                        <span className="font-black text-amber-900">R$ {preset.defaultCost.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between bg-emerald-50/60 p-2 rounded-lg border border-emerald-100/60">
                        <span className="text-emerald-800 font-medium">Preço Venda:</span>
                        <span className="font-black text-emerald-900">R$ {preset.defaultPrice.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1 mt-3 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPreset(preset);
                        setNewPresetName(preset.name);
                        setNewPresetCost(preset.defaultCost.toString());
                        setNewPresetPrice(preset.defaultPrice.toString());
                        setNewPresetUnit(preset.unit);
                        setIsAddingPreset(true);
                      }}
                      className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
                      title="Editar Predefinição"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePreset(preset.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                      title="Excluir Predefinição"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: NOVO / EDITAR PEDIDO DE COMPRA DE TERCEIROS */}
      {/* ========================================================================= */}
      {isNewPurchaseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Topo Modal */}
            <div className="bg-slate-900 text-white p-5 md:p-6 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Truck size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">
                    {editingPurchase ? 'Editar Pedido de Compra' : 'Lançar Compra de Terceiros / Ceasa'}
                  </h3>
                  <p className="text-xs text-slate-300">
                    Preencha os produtos comprados para abastecer seu estoque e controlar o pagamento.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewPurchaseModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Corpo do Formulário */}
            <form onSubmit={handleSavePurchase} className="p-5 md:p-6 overflow-y-auto flex-1 space-y-6">
              {/* 1. Dados do Fornecedor e Datas */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-1 space-y-1.5">
                  <label className="block text-xs font-black uppercase text-slate-600 tracking-wider">
                    Fornecedor / Origem *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Ceasa Box 12, Produtor Zé..."
                    value={formSupplier}
                    onChange={(e) => setFormSupplier(e.target.value)}
                    list="suppliers-list"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <datalist id="suppliers-list">
                    {previousSuppliers.map(s => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-black uppercase text-slate-600 tracking-wider">
                    Data da Compra *
                  </label>
                  <input
                    type="date"
                    required
                    value={formPurchaseDate}
                    onChange={(e) => setFormPurchaseDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-black uppercase text-slate-600 tracking-wider">
                    Status de Pagamento *
                  </label>
                  <select
                    value={formPaymentStatus}
                    onChange={(e) => setFormPaymentStatus(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="paid">✅ Já Pago (Lança no Financeiro)</option>
                    <option value="pending">⏳ A Pagar / Pendente (A Prazo)</option>
                  </select>
                </div>
              </div>

              {/* Se for pago ou a pagar, mostrar opções de pagamento/vencimento */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                {formPaymentStatus === 'paid' ? (
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="block text-xs font-bold text-slate-600">Forma de Pagamento Utilizada</label>
                    <div className="flex flex-wrap gap-2">
                      {['Pix', 'Dinheiro', 'Boleto', 'Cartão de Débito', 'Cartão de Crédito', 'Transferência'].map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setFormPaymentMethod(m)}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                            formPaymentMethod === m 
                              ? "bg-emerald-600 text-white shadow-sm" 
                              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                          )}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="block text-xs font-bold text-amber-800">
                      Data Prevista para Pagamento (Vencimento da Mercadoria)
                    </label>
                    <input
                      type="date"
                      value={formDueDate}
                      onChange={(e) => setFormDueDate(e.target.value)}
                      className="w-full sm:w-60 px-3.5 py-2 bg-white border border-amber-300 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                )}
              </div>

              {/* 2. ADICIONAR ITENS À COMPRA */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-black uppercase text-slate-800 tracking-wider">
                    Produtos Comprados neste Lote
                  </label>
                  <span className="text-xs text-slate-400">
                    {formItems.length} {formItems.length === 1 ? 'item adicionado' : 'itens adicionados'}
                  </span>
                </div>

                {/* Bloco de Adição Rápida */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    {/* Selecionar Produto */}
                    <div className="sm:col-span-5 space-y-1">
                      <label className="block text-[11px] font-bold text-slate-500">Produto / Mercadoria</label>
                      <input
                        type="text"
                        placeholder="Nome do produto ou escolha..."
                        value={customItemName}
                        onChange={(e) => {
                          setCustomItemName(e.target.value);
                          setSelectedPresetId('');
                        }}
                        list="products-preset-list"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <datalist id="products-preset-list">
                        {availableProductOptions.map(p => (
                          <option key={p.name} value={p.name}>
                            {p.name} (Custo Médio: R$ {p.defaultCost.toFixed(2)}/{p.unit})
                          </option>
                        ))}
                      </datalist>
                    </div>

                    {/* Quantidade */}
                    <div className="sm:col-span-2 space-y-1">
                      <label className="block text-[11px] font-bold text-slate-500">Quantidade</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={itemQty}
                        onChange={(e) => setItemQty(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 text-center"
                      />
                    </div>

                    {/* Unidade */}
                    <div className="sm:col-span-2 space-y-1">
                      <label className="block text-[11px] font-bold text-slate-500">Unidade</label>
                      <select
                        value={itemUnit}
                        onChange={(e) => setItemUnit(e.target.value)}
                        className="w-full px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                      >
                        <option value="kg">kg (Quilo)</option>
                        <option value="un">un (Unidade)</option>
                        <option value="cx">cx (Caixa)</option>
                        <option value="dz">dz (Dúzia)</option>
                        <option value="pct">pct (Pacote)</option>
                      </select>
                    </div>

                    {/* Custo Unitário */}
                    <div className="sm:col-span-2 space-y-1">
                      <label className="block text-[11px] font-bold text-slate-500">Custo (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="R$ 0,00"
                        value={itemUnitCost}
                        onChange={(e) => setItemUnitCost(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 text-right"
                      />
                    </div>

                    {/* Botão + Adicionar */}
                    <div className="sm:col-span-1">
                      <button
                        type="button"
                        onClick={handleAddItemToForm}
                        className="w-full h-[38px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-base flex items-center justify-center shadow-sm transition-all cursor-pointer"
                        title="Adicionar item à compra"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Lista de Itens Adicionados */}
                {formItems.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4 italic">
                    Nenhum produto adicionado ainda. Preencha acima e clique no botão "+" para incluir.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl p-2 bg-white">
                    {formItems.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between py-2 px-3 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[10px]">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-slate-900">{item.name}</span>
                          <span className="text-slate-500 font-medium">
                            ({item.quantity} {item.unit} x R$ {item.unitCost.toFixed(2)})
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-black text-slate-900">
                            R$ {item.totalCost.toFixed(2)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveItemFromForm(idx)}
                            className="text-rose-500 hover:bg-rose-50 p-1 rounded-lg transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Observações */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600">Observações da Compra (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: Nota fiscal nº 4432, pago em dinheiro no ato, mercadoria de ótima qualidade..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                />
              </div>

              {/* Totalizador do Modal */}
              <div className="bg-slate-900 text-white p-4 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Valor Total do Pedido de Compra</span>
                  <span className="text-xs text-emerald-400 font-semibold">
                    {formPaymentStatus === 'paid' ? 'Será registrado no Financeiro como Pago' : 'Ficará como Pendente no Contas a Pagar'}
                  </span>
                </div>
                <span className="text-2xl font-black text-white">
                  R$ {formTotalAmount.toFixed(2)}
                </span>
              </div>

              {/* Rodapé / Botões de Ação */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewPurchaseModalOpen(false)}
                  className="px-5 py-2.5 text-slate-500 hover:bg-slate-100 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || formItems.length === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-7 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 shadow-lg shadow-emerald-200 transition-all cursor-pointer"
                >
                  <Save size={16} />
                  {saving ? 'Salvando...' : 'Salvar Pedido de Compra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CONFIRMAR PAGAMENTO DE COMPRA PENDENTE */}
      {/* ========================================================================= */}
      {isMarkingPaidModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-emerald-600 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 size={22} />
                <h3 className="text-base font-black">Confirmar Pagamento de Compra</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsMarkingPaidModalOpen(null)}
                className="p-1 text-white/80 hover:text-white rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                <span className="text-xs text-emerald-800 font-bold block">Fornecedor:</span>
                <span className="text-base font-black text-emerald-950 block">{isMarkingPaidModalOpen.supplierName}</span>
                <span className="text-xs text-emerald-700 block mt-1">
                  Valor a Pagar: <strong className="text-emerald-900 text-sm">R$ {isMarkingPaidModalOpen.totalAmount.toFixed(2)}</strong>
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">Data do Pagamento</label>
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">Forma de Pagamento</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                >
                  <option value="Pix">Pix</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Boleto">Boleto Bancário</option>
                  <option value="Cartão de Débito">Cartão de Débito</option>
                  <option value="Cartão de Crédito">Cartão de Crédito</option>
                  <option value="Transferência">Transferência Bancária</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsMarkingPaidModalOpen(null)}
                  className="px-4 py-2 text-slate-500 text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPayment}
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md shadow-emerald-100 transition-all cursor-pointer"
                >
                  <Check size={16} />
                  {saving ? 'Confirmando...' : 'Confirmar e Lançar Despesa'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: NOVO / EDITAR PREDEFINIÇÃO DE PRODUTO */}
      {/* ========================================================================= */}
      {isAddingPreset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <h3 className="text-base font-black">
                {editingPreset ? 'Editar Produto Pré-Salvo' : 'Novo Produto Pré-Salvo de Revenda'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddingPreset(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePreset} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">Nome do Produto *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Pimentão Amarelo, Repolho..."
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">Custo de Compra (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ex: 4.50"
                    value={newPresetCost}
                    onChange={(e) => setNewPresetCost(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 text-right"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">Preço de Venda (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ex: 8.00"
                    value={newPresetPrice}
                    onChange={(e) => setNewPresetPrice(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 text-right"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">Unidade de Medida</label>
                <select
                  value={newPresetUnit}
                  onChange={(e) => setNewPresetUnit(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                >
                  <option value="kg">kg (Quilo)</option>
                  <option value="un">un (Unidade)</option>
                  <option value="cx">cx (Caixa)</option>
                  <option value="dz">dz (Dúzia)</option>
                  <option value="pct">pct (Pacote)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddingPreset(false)}
                  className="px-4 py-2 text-slate-500 text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-xs font-black shadow-md shadow-emerald-100 transition-all cursor-pointer"
                >
                  Salvar Predefinição
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
