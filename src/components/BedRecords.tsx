import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc,
  where,
  getDocs,
  increment,
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { BedRecord, Production, InventoryItem } from '../types';
import { 
  ClipboardCheck, 
  Sprout, 
  Calendar, 
  AlertCircle, 
  Trash2, 
  Plus, 
  Search, 
  Filter, 
  Database, 
  Droplet, 
  Activity, 
  Sparkles, 
  History, 
  User, 
  CheckCircle2, 
  AlertTriangle,
  FileSpreadsheet,
  X,
  PlusCircle,
  Tag,
  Printer,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn, handleFirestoreError, OperationType, useAuth } from '../App';

export default function BedRecordsComponent() {
  const { profile } = useAuth();
  const [records, setRecords] = useState<BedRecord[]>([]);
  const [productions, setProductions] = useState<Production[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setModalOpen] = useState(false);
  
  // Print manual forms state
  const [isPrintModalOpen, setPrintModalOpen] = useState(false);
  const [printFormType, setPrintFormType] = useState<'daily' | 'clinical'>('daily');
  const [printBedName, setPrintBedName] = useState<string>('Canteiro 1');
  
  // Tab states
  const [selectedBed, setSelectedBed] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'cards' | 'history'>('cards');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  // Form Field States
  const [bedId, setBedId] = useState('');
  const [crop, setCrop] = useState('');
  const [eventDate, setEventDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [activityType, setActivityType] = useState<'planting' | 'treatment' | 'fertilization' | 'harvest' | 'general'>('treatment');
  
  const [treatmentDescription, setTreatmentDescription] = useState('');
  const [fertilizerDescription, setFertilizerDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('unidades');
  const [bedHarvestType, setBedHarvestType] = useState<'partial' | 'final'>('final');

  const [employeeName, setEmployeeName] = useState(profile?.displayName || '');
  const [notes, setNotes] = useState('');
  const [autoSync, setAutoSync] = useState(true);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ type: 'success' | 'warn' | 'error', text: string } | null>(null);

  // Suggested Garden Beds (default 1 to 12 or custom beds extracted from production metadata)
  const defaultBeds = Array.from({ length: 15 }, (_, i) => `Canteiro ${i + 1}`);

  useEffect(() => {
    // 1. Fetch garden bed records
    const recordsQ = query(collection(db, 'bed_records'), orderBy('date', 'desc'));
    const unsubscribeRecords = onSnapshot(recordsQ, (snapshot) => {
      setRecords(snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          date: data.date
        } as BedRecord;
      }));
      setLoading(false);
    }, (error) => {
      console.error("Erro recs:", error);
      setLoading(false);
    });

    // 2. Fetch Active Production Cycles to display bed status
    const productionQ = query(collection(db, 'production'), orderBy('plantingDate', 'desc'));
    const unsubscribeProduction = onSnapshot(productionQ, (snapshot) => {
      setProductions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Production)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'production');
    });

    // 3. Fetch Inventory items for crop autosuggest etc.
    const invQ = query(collection(db, 'inventory'), orderBy('name', 'asc'));
    const unsubscribeInv = onSnapshot(invQ, (snapshot) => {
      setInventory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem)));
    });

    return () => {
      unsubscribeRecords();
      unsubscribeProduction();
      unsubscribeInv();
    };
  }, []);

  // Set default employee name when profile changes
  useEffect(() => {
    if (profile?.displayName) {
      setEmployeeName(profile.displayName);
    }
  }, [profile]);

  // Extract all unique beds from records & production to ensure we showcase everything
  const allBeds = Array.from(new Set([
    ...defaultBeds,
    ...productions.map(p => p.bed),
    ...records.map(r => r.bedId)
  ]))
  .filter(Boolean)
  .sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ''), 10);
    const numB = parseInt(b.replace(/\D/g, ''), 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });

  // Extract growing crops in each canteiro right now
  const getBedStatus = (bedName: string) => {
    const activeCycles = productions.filter(p => p.bed === bedName && p.status === 'growing');
    if (activeCycles.length > 0) {
      return {
        status: 'growing' as const,
        crop: activeCycles.map(c => c.crop).join(', '),
        plantingDate: activeCycles[0].plantingDate,
        productionId: activeCycles[0].id
      };
    }
    return { status: 'idle' as const };
  };

  const getBedLastLogs = (bedName: string) => {
    const bedRecs = records.filter(r => r.bedId === bedName);
    const lastFertilizer = bedRecs.find(r => r.activityType === 'fertilization');
    const lastTreatment = bedRecs.find(r => r.activityType === 'treatment');
    const lastHarvest = bedRecs.find(r => r.activityType === 'harvest');
    return {
      fertilizer: lastFertilizer ? lastFertilizer.date : null,
      treatment: lastTreatment ? lastTreatment.date : null,
      harvest: lastHarvest ? lastHarvest.date : null
    };
  };

  const resetForm = () => {
    setBedId('');
    setCrop('');
    setEventDate(format(new Date(), 'yyyy-MM-dd'));
    setActivityType('treatment');
    setTreatmentDescription('');
    setFertilizerDescription('');
    setQuantity('');
    setUnit('unidades');
    setBedHarvestType('final');
    setNotes('');
    setSyncStatusMsg(null);
  };

  const openFormForBed = (bedName: string) => {
    resetForm();
    setBedId(bedName);
    
    // Auto-detect currently growing crop inside this bed to pre-populate for treatments/fertilizations/harvests!
    const active = getBedStatus(bedName);
    if (active.status === 'growing') {
      setCrop(active.crop);
      const productionMatch = productions.find(p => p.bed === bedName && p.status === 'growing' && p.crop.toLowerCase() === active.crop.toLowerCase());
      if (productionMatch) {
        setBedHarvestType(productionMatch.isContinuousHarvest ? 'partial' : 'final');
      }
    }
    setModalOpen(true);
  };

  const handleCreateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bedId.trim() || !crop.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setSyncStatusMsg(null);

    const recordDate = new Date(eventDate + 'T12:00:00');
    const recordTimestamp = Timestamp.fromDate(recordDate);
    const parsedQuantity = quantity ? parseFloat(quantity) : 0;

    try {
      let syncResultText = '';
      let productionId: string | undefined = undefined;
      let matchedCycle: Production | undefined = undefined;

      // 1. Core integration logic with the system ("para depois alimentar o sistema e ter os dados atualizados")
      if (autoSync) {
        if (activityType === 'planting') {
          // Add production cycle directly
          const initialLogDescription = `Semeadura direta por prontuário do canteiro. Realizado por ${employeeName || 'Funcionário'}.`;
          const initialLog = {
            date: recordTimestamp,
            description: initialLogDescription,
            products: []
          };

          const prodData = {
            crop: crop.trim(),
            bed: bedId.trim(),
            plantingDate: recordTimestamp,
            transplantDate: null,
            estimatedHarvestDate: null,
            quantityPlanted: parsedQuantity || 1,
            unit: 'unidades',
            inputsUsed: [],
            isContinuousHarvest: false,
            logs: [initialLog],
            status: 'growing' as const,
            totalCost: 0,
            unitCost: 0,
            createdAt: serverTimestamp()
          };

          const docRef = await addDoc(collection(db, 'production'), prodData);
          productionId = docRef.id;
          syncResultText = `✓ Nova Produção Ativa criada para ${crop} no ${bedId}!`;

        } else if (activityType === 'treatment' || activityType === 'fertilization') {
          // Append logs to actual active production cycles in this canteiro
          const activeCycles = productions.filter(
            p => p.bed === bedId && p.status === 'growing' && p.crop.toLowerCase() === crop.toLowerCase()
          );

          if (activeCycles.length > 0) {
            matchedCycle = activeCycles[0];
            const originalLogs = [...(matchedCycle.logs || [])];
            
            const descLog = activityType === 'fertilization' 
              ? `Adubação por prontuário: ${fertilizerDescription.trim()}. Realizado por ${employeeName || 'Funcionário'}.`
              : `Tratamento por prontuário: ${treatmentDescription.trim()}. Realizado por ${employeeName || 'Funcionário'}.`;

            const newLog = {
              date: recordTimestamp,
              description: descLog,
              products: []
            };

            await updateDoc(doc(db, 'production', matchedCycle.id), {
              logs: [...originalLogs, newLog]
            });
            productionId = matchedCycle.id;
            syncResultText = `✓ Manejo inserido com sucesso na Produção Ativa de ${crop}!`;
          } else {
            syncResultText = `⚠️ Registro salvo localmente, mas não encontramos ciclo ativo para de [${crop}] no [${bedId}] para injetar o manejo.`;
          }

        } else if (activityType === 'harvest') {
          // Execute harvest cycle on active productions
          const activeCycles = productions.filter(
            p => p.bed === bedId && p.status === 'growing' && p.crop.toLowerCase() === crop.toLowerCase()
          );

          if (activeCycles.length > 0) {
            matchedCycle = activeCycles[0];
            const harvestQty = parsedQuantity || 1;
            const originalCosts = matchedCycle.totalCost || 0;
            
            const priorHarvestQuantity = matchedCycle.harvestQuantity || 0;
            const totalNewHarvestQuantity = priorHarvestQuantity + harvestQty;
            
            let unitCost = 0;
            if (bedHarvestType === 'final') {
              unitCost = totalNewHarvestQuantity > 0 ? originalCosts / totalNewHarvestQuantity : 0;
            } else {
              unitCost = originalCosts / (matchedCycle.quantityPlanted || 1);
            }

            const isFinal = bedHarvestType === 'final';
            const newStatus = isFinal ? 'harvested' : 'growing';

            const harvestLog = {
              date: recordTimestamp,
              description: isFinal 
                ? `Colheita Final via Prontuário realizada: ${harvestQty} ${matchedCycle.unit || 'unidades'}. Lote encerrado.` 
                : `Colheita Parcial via Prontuário realizada: ${harvestQty} ${matchedCycle.unit || 'unidades'}. Lote continua ativo.`,
              products: []
            };

            // Mark as harvested / update production
            await updateDoc(doc(db, 'production', matchedCycle.id), {
              status: newStatus,
              harvestQuantity: increment(harvestQty),
              remainingQuantity: increment(harvestQty),
              harvestDate: recordTimestamp,
              unitCost,
              logs: [...(matchedCycle.logs || []), harvestLog]
            });
            productionId = matchedCycle.id;

            // Handle inventory items (Dispatch / Produce)
            const invQ = query(collection(db, 'inventory'), where('name', '==', matchedCycle.crop));
            const invSnap = await getDocs(invQ);

            if (!invSnap.empty) {
              const existingDoc = invSnap.docs[0];
              const existingData = existingDoc.data();
              const currentQty = existingData.quantity || 0;
              const currentCost = existingData.costPrice || 0;
              const newTotalCost = (currentQty * currentCost) + (harvestQty * unitCost);
              const totalQty = currentQty + harvestQty;
              const newAvgCost = totalQty > 0 ? newTotalCost / totalQty : 0;

              // Update stock quantity and cost price
              await updateDoc(doc(db, 'inventory', existingDoc.id), {
                quantity: increment(harvestQty),
                type: 'dispatch',
                lastUpdated: serverTimestamp(),
                costPrice: newAvgCost
              });

              // Add history entry
              await addDoc(collection(db, 'inventory_history'), {
                itemId: existingDoc.id,
                itemName: matchedCycle.crop,
                quantity: harvestQty,
                unit: matchedCycle.unit || 'unidades',
                costPrice: unitCost,
                price: existingData.price || 0,
                type: 'harvest',
                description: `Entrada via Colheita do Prontuário (${bedId})`,
                date: serverTimestamp()
              });
            } else {
              // Create new dispatch item
              const docRef = await addDoc(collection(db, 'inventory'), {
                name: matchedCycle.crop,
                type: 'dispatch',
                category: 'produce',
                quantity: harvestQty,
                unit: matchedCycle.unit || 'unidades',
                price: 0,
                costPrice: unitCost,
                minStock: 0,
                lastUpdated: serverTimestamp()
              });

              // Add history entry
              await addDoc(collection(db, 'inventory_history'), {
                itemId: docRef.id,
                itemName: matchedCycle.crop,
                quantity: harvestQty,
                unit: matchedCycle.unit || 'unidades',
                costPrice: unitCost,
                price: 0,
                type: 'harvest',
                description: `Entrada via Colheita do Prontuário (${bedId})`,
                date: serverTimestamp()
              });
            }
            syncResultText = isFinal 
              ? `✓ Colheita computada no estoque de expedição! Ciclo de produção finalizado.`
              : `✓ Colheita parcial de ${harvestQty} computada no estoque! O ciclo continua Ativo para mais colheitas.`;
          } else {
            syncResultText = `⚠️ Colheita salva, mas não havia ciclo de [${crop}] ativo crescendo no [${bedId}].`;
          }
        }
      }

      // 2. Add the actual garden bed record document for the visual timeline / medical charts
      const recordData: any = {
        bedId: bedId.trim(),
        date: recordTimestamp,
        crop: crop.trim(),
        activityType,
        employeeName: employeeName.trim() || 'Funcionário',
        notes: notes.trim(),
        syncedToProduction: autoSync,
        createdAt: serverTimestamp()
      };

      if (productionId) {
        recordData.productionId = productionId;
      }

      if (activityType === 'treatment') {
        recordData.treatmentDescription = treatmentDescription.trim();
      } else if (activityType === 'fertilization') {
        recordData.fertilizerDescription = fertilizerDescription.trim();
      } else if (activityType === 'harvest') {
        recordData.harvestQuantity = parsedQuantity;
        recordData.harvestUnit = unit;
      } else if (activityType === 'planting') {
        recordData.quantityPlanted = parsedQuantity;
        recordData.unitPlanted = unit;
      }

      await addDoc(collection(db, 'bed_records'), recordData);

      resetForm();
      setModalOpen(false);
      
      if (syncResultText) {
        alert(`Prontuário salvo!\n${syncResultText}`);
      } else {
        alert(`Prontuário gravado com sucesso para o ${bedId}!`);
      }
    } catch (error: any) {
      console.error("Save Record Error:", error);
      alert('Erro ao salvar prontuário: ' + (error.message || 'Verifique as regras.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRecord = async (id: string) => {
    if (!confirm('Deseja realmente excluir este registro do prontuário médico do canteiro? Isso serve como histórico permanente.')) return;
    try {
      await deleteDoc(doc(db, 'bed_records', id));
    } catch (e: any) {
      alert('Erro ao excluir registro: ' + e.message);
    }
  };

  const getFormattedDate = (timestamp: any) => {
    if (!timestamp) return '---';
    const dateObj = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return format(dateObj, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  };

  const getTimelineBadge = (type: string) => {
    switch (type) {
      case 'planting':
        return { label: '🌱 Plantio', color: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
      case 'treatment':
        return { label: '💊 Tratamento', color: 'bg-indigo-50 text-indigo-700 border-indigo-100' };
      case 'fertilization':
        return { label: '🧪 Adubação', color: 'bg-amber-50 text-amber-700 border-amber-100' };
      case 'harvest':
        return { label: '🧺 Colheita', color: 'bg-rose-50 text-rose-700 border-rose-100' };
      default:
        return { label: '📝 Geral', color: 'bg-slate-50 text-slate-700 border-slate-100' };
    }
  };

  const filteredRecords = records.filter(r => {
    const matchesSearch = r.bedId?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          r.crop?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          r.notes?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBed = selectedBed ? r.bedId === selectedBed : true;
    const matchesType = filterType === 'all' ? true : r.activityType === filterType;
    return matchesSearch && matchesBed && matchesType;
  });

  return (
    <div className="space-y-6 md:space-y-8 pb-20 print:p-0">
      {/* Elementos visíveis no App (Escondidos ao Imprimir) */}
      <div className="print:hidden space-y-6 md:space-y-8">
      {/* Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm uppercase tracking-wider mb-1">
            <Activity className="w-4 h-4" />
            <span>Prontuário Médico da Horta</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900">Diário dos Canteiros</h2>
          <p className="text-slate-500 mt-1 text-sm md:text-base">
            Visualize os canteiros como pacientes e alimente os relatórios do sistema com as atividades diárias.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button 
            type="button"
            onClick={() => setPrintModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-5 py-3 rounded-xl font-bold transition-all active:scale-95 text-sm md:text-base print:hidden shadow-sm"
          >
            <Printer size={18} className="text-emerald-600" />
            Imprimir Fichas (Papel)
          </button>
          
          <button 
            type="button"
            onClick={() => { resetForm(); setModalOpen(true); }}
            className="flex items-center justify-center gap-2 bg-emerald-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95 text-sm md:text-base print:hidden"
          >
            <PlusCircle size={18} />
            Novo Registro de Canteiro
          </button>
        </div>
      </header>

      {/* Overview stats cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <Sprout size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Canteiros Ativos</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-0.5">
              {allBeds.filter(b => getBedStatus(b).status === 'growing').length} canteiros
            </h3>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <ClipboardCheck size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Registros de Prontuário</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-0.5">
              {records.length} lançados
            </h3>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3.5 bg-amber-50 text-amber-600 rounded-xl">
            <Sparkles size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sincronizados com Estoque</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-0.5">
              {records.filter(r => r.syncedToProduction).length} automatizados
            </h3>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => { setSelectedBed(null); setActiveSubTab('cards'); }}
          className={cn(
            "pb-4 font-bold text-sm transition-all relative border-b-2",
            activeSubTab === 'cards' && !selectedBed
              ? "border-emerald-600 text-emerald-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          Painel de Canteiros
        </button>
        <button
          onClick={() => { setActiveSubTab('history'); }}
          className={cn(
            "pb-4 font-bold text-sm transition-all relative border-b-2",
            activeSubTab === 'history'
              ? "border-emerald-600 text-emerald-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          Histórico Geral de Atividades
        </button>
      </div>

      {/* Interactive Main View */}
      {activeSubTab === 'cards' && (
        <div className="space-y-6">
          {selectedBed ? (
            <div className="space-y-6">
              {/* Individual Bed Focus Medical Chart Style */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 bg-slate-900 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-emerald-600 text-white rounded-2xl flex items-center justify-center font-bold text-xl shadow-lg shadow-emerald-500/10">
                      {selectedBed.replace(/\D/g, '') || selectedBed[0]}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">{selectedBed}</h3>
                      <div className="flex items-center gap-2 text-xs text-slate-300 mt-0.5">
                        <span>Prontuário Médico</span>
                        <span>•</span>
                        {getBedStatus(selectedBed).status === 'growing' ? (
                          <span className="text-emerald-400 font-bold flex items-center gap-1">
                            🌱 Ativo: {getBedStatus(selectedBed).crop}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-bold">💤 Livre / Ocioso</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openFormForBed(selectedBed)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm transition-all active:scale-95 flex items-center gap-2"
                    >
                      <Plus size={16} />
                      Nova Consulta/Atividade
                    </button>
                    <button
                      onClick={() => setSelectedBed(null)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-sm transition-all"
                    >
                      Voltar para Painel
                    </button>
                  </div>
                </div>

                <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-6 border-b border-slate-100 bg-slate-50">
                  <div className="space-y-1">
                    <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Último Tratamento</p>
                    <p className="text-sm font-bold text-slate-700">
                      {getBedLastLogs(selectedBed).treatment 
                        ? getFormattedDate(getBedLastLogs(selectedBed).treatment)
                        : 'Nenhum registrado'
                      }
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Última Adubação</p>
                    <p className="text-sm font-bold text-slate-700">
                      {getBedLastLogs(selectedBed).fertilizer 
                        ? getFormattedDate(getBedLastLogs(selectedBed).fertilizer)
                        : 'Nenhuma registrada'
                      }
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Última Colheita</p>
                    <p className="text-sm font-bold text-slate-700">
                      {getBedLastLogs(selectedBed).harvest 
                        ? getFormattedDate(getBedLastLogs(selectedBed).harvest)
                        : 'Nenhuma registrada'
                      }
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Ciclo Atual</p>
                    <p className="text-sm font-bold text-slate-700">
                      {getBedStatus(selectedBed).status === 'growing' ? (
                        <span>Plantado em {getFormattedDate(getBedStatus(selectedBed).plantingDate)}</span>
                      ) : (
                        <span className="text-slate-400">Pronto para novo plantio</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Timeline / Consultation history for this specific bed */}
                <div className="p-6">
                  <h4 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <History size={18} className="text-emerald-600" />
                    Histórico Clínico do Canteiro
                  </h4>

                  {records.filter(r => r.bedId === selectedBed).length === 0 ? (
                    <div className="text-center py-16 text-slate-400">
                      <ClipboardCheck size={48} className="mx-auto mb-4 opacity-10" />
                      <p className="text-sm">Nenhuma atividade registrada no prontuário deste canteiro.</p>
                      <button
                        onClick={() => openFormForBed(selectedBed)}
                        className="mt-4 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl font-bold text-xs transition-all"
                      >
                        Registrar Primeiro Evento
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {records.filter(r => r.bedId === selectedBed).map((record) => {
                        const badge = getTimelineBadge(record.activityType);
                        return (
                          <div key={record.id} className="p-5 bg-white border border-slate-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md transition-all">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-bold border", badge.color)}>
                                  {badge.label}
                                </span>
                                <span className="text-xs font-bold text-slate-400">
                                  {getFormattedDate(record.date)}
                                </span>
                                {record.syncedToProduction && (
                                  <span className="bg-emerald-100 text-emerald-800 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <Database size={10} />
                                    Vinc. Sistema
                                  </span>
                                )}
                              </div>
                              <h5 className="font-bold text-slate-800 text-base">
                                Cultura: {record.crop}
                              </h5>
                              
                              {/* Specific activity messages */}
                              {record.activityType === 'treatment' && record.treatmentDescription && (
                                <p className="text-sm text-slate-600 md:pl-2 border-l-2 border-indigo-400">
                                  <strong>Tratamento realizado:</strong> {record.treatmentDescription}
                                </p>
                              )}
                              {record.activityType === 'fertilization' && record.fertilizerDescription && (
                                <p className="text-sm text-slate-600 md:pl-2 border-l-2 border-amber-400">
                                  <strong>Adubação aplicada:</strong> {record.fertilizerDescription}
                                </p>
                              )}
                              {record.activityType === 'harvest' && record.harvestQuantity && (
                                <p className="text-sm text-slate-600 md:pl-2 border-l-2 border-rose-400 font-medium">
                                  <strong>Quantidade Colhida:</strong> {record.harvestQuantity} {record.harvestUnit}
                                </p>
                              )}
                              {record.activityType === 'planting' && record.quantityPlanted && (
                                <p className="text-sm text-slate-600 md:pl-2 border-l-2 border-emerald-400 font-medium">
                                  <strong>Plantio Realizado:</strong> {record.quantityPlanted} {record.unitPlanted}
                                </p>
                              )}

                              {record.notes && (
                                <p className="text-xs text-slate-500 italic">
                                  Observação: "{record.notes}"
                                </p>
                              )}

                              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                                <User size={12} />
                                <span>Registrado por: <strong>{record.employeeName || 'Funcionário'}</strong></span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 self-end md:self-center">
                              <button
                                onClick={() => handleDeleteRecord(record.id)}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Excluir do prontuário"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Visual Grid Board of All Canteiros as Patients */
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Clique em um canteiro para prontuário clínico detalhado</span>
                <span className="text-xs font-medium text-slate-500">Total: {allBeds.length} canteiros</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {allBeds.map((bed) => {
                  const active = getBedStatus(bed);
                  const lastLogs = getBedLastLogs(bed);
                  const isGrowing = active.status === 'growing';

                  return (
                    <div 
                      key={bed}
                      onClick={() => setSelectedBed(bed)}
                      className={cn(
                        "bg-white rounded-2xl border p-5 transition-all cursor-pointer shadow-sm relative group hover:-translate-y-1 hover:shadow-md",
                        isGrowing 
                          ? "border-emerald-100 hover:border-emerald-300" 
                          : "border-slate-200 hover:border-slate-300"
                      )}
                    >
                      {/* Bed Header */}
                      <div className="flex justify-between items-start mb-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 text-white font-bold text-sm tracking-tight flex items-center justify-center">
                          {bed.replace(/\D/g, '') || bed[0]}
                        </div>
                        {isGrowing ? (
                          <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border border-emerald-100">
                            🌱 {active.crop}
                          </span>
                        ) : (
                          <span className="bg-slate-50 text-slate-400 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border border-slate-100">
                            💤 Livre
                          </span>
                        )}
                      </div>

                      {/* Bed info body */}
                      <h4 className="font-bold text-slate-800 text-base mb-1 truncate">{bed}</h4>
                      
                      <div className="space-y-1 text-xs mt-3 text-slate-500 border-t border-slate-50 pt-3">
                        <div className="flex justify-between">
                          <span>Adubação:</span>
                          <span className="font-bold text-slate-700">
                            {lastLogs.fertilizer ? format(lastLogs.fertilizer.toDate ? lastLogs.fertilizer.toDate() : new Date(lastLogs.fertilizer), 'dd/MM/yy') : '---'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Tratamento:</span>
                          <span className="font-bold text-slate-700">
                            {lastLogs.treatment ? format(lastLogs.treatment.toDate ? lastLogs.treatment.toDate() : new Date(lastLogs.treatment), 'dd/MM/yy') : '---'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Colheita:</span>
                          <span className="font-bold text-slate-700">
                            {lastLogs.harvest ? format(lastLogs.harvest.toDate ? lastLogs.harvest.toDate() : new Date(lastLogs.harvest), 'dd/MM/yy') : '---'}
                          </span>
                        </div>
                      </div>

                      {/* Hover action guide */}
                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-emerald-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                        <span>Ver Prontuário Clínico</span>
                        <PlusCircle size={14} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Full Registry List Tab */}
      {activeSubTab === 'history' && (
        <div className="space-y-4">
          {/* Search, Filter, Toolbars */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input 
                type="text" 
                placeholder="Buscar por Cultura, canteiro, observação..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-600 rounded-xl px-4 py-2 font-bold text-xs"
              >
                <option value="all">Todas Atividades</option>
                <option value="planting">🌱 Só Plantios</option>
                <option value="treatment">💊 Só Tratamentos</option>
                <option value="fertilization">🧪 Só Adubações</option>
                <option value="harvest">🧺 Só Colheitas</option>
                <option value="general">📝 Só Gerais</option>
              </select>
            </div>
          </div>

          {filteredRecords.length === 0 ? (
            <div className="text-center py-20 bg-white border border-slate-200 rounded-2xl text-slate-400">
              <ClipboardCheck size={48} className="mx-auto mb-4 opacity-20" />
              <p className="text-sm">Nenhum registro encontrado correspondente aos filtros.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRecords.map((record) => {
                const badge = getTimelineBadge(record.activityType);
                return (
                  <div key={record.id} className="p-5 bg-white border border-slate-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md transition-all">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-lg text-xs">
                          {record.bedId}
                        </span>
                        <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-bold border", badge.color)}>
                          {badge.label}
                        </span>
                        <span className="text-xs font-bold text-slate-400">
                          {getFormattedDate(record.date)}
                        </span>
                        {record.syncedToProduction && (
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                            <Database size={10} />
                            Vinc. Sistema
                          </span>
                        )}
                      </div>
                      <h5 className="font-bold text-slate-800 text-base">
                        Cultura: {record.crop}
                      </h5>
                      
                      {/* Sub-details depending on record properties */}
                      {record.activityType === 'treatment' && record.treatmentDescription && (
                        <p className="text-sm text-slate-600 md:pl-2 border-l-2 border-indigo-400">
                          <strong>Tratamento realizado:</strong> {record.treatmentDescription}
                        </p>
                      )}
                      {record.activityType === 'fertilization' && record.fertilizerDescription && (
                        <p className="text-sm text-slate-600 md:pl-2 border-l-2 border-amber-400">
                          <strong>Adubação aplicada:</strong> {record.fertilizerDescription}
                        </p>
                      )}
                      {record.activityType === 'harvest' && record.harvestQuantity && (
                        <p className="text-sm text-slate-600 md:pl-2 border-l-2 border-rose-400 font-medium">
                          <strong>Quantidade Colhida:</strong> {record.harvestQuantity} {record.harvestUnit}
                        </p>
                      )}
                      {record.activityType === 'planting' && record.quantityPlanted && (
                        <p className="text-sm text-slate-600 md:pl-2 border-l-2 border-emerald-400 font-medium">
                          <strong>Plantio Realizado:</strong> {record.quantityPlanted} {record.unitPlanted}
                        </p>
                      )}

                      {record.notes && (
                        <p className="text-xs text-slate-500 italic">
                          Observação: "{record.notes}"
                        </p>
                      )}

                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <User size={12} />
                        <span>Registrado por: <strong>{record.employeeName || 'Funcionário'}</strong></span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end md:self-center">
                      <button
                        onClick={() => handleDeleteRecord(record.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Excluir do prontuário"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL - Record activity in Bed Form */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden z-10"
            >
              {/* Modal Header */}
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ClipboardCheck className="text-emerald-400" />
                  <div>
                    <h3 className="font-bold text-lg">Consulta Clíncia do Canteiro</h3>
                    <p className="text-xs text-slate-300">Lance o diagnóstico / tratamento / colheita</p>
                  </div>
                </div>
                <button 
                  onClick={() => setModalOpen(false)}
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Form Body */}
              <form onSubmit={handleCreateRecord} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  {/* Bed Identification */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Canteiro No.*</label>
                    <input 
                      type="text"
                      required
                      placeholder="Ex: Canteiro 3"
                      value={bedId}
                      onChange={(e) => setBedId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
                      list="bed-names"
                    />
                    <datalist id="bed-names">
                      {allBeds.map(b => (
                        <option key={b} value={b} />
                      ))}
                    </datalist>
                  </div>

                  {/* Culture Crop */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Cultura / Cultura*</label>
                    <input 
                      type="text"
                      required
                      placeholder="Ex: Alface Crespa"
                      value={crop}
                      onChange={(e) => setCrop(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
                      list="crop-suggestions"
                    />
                    <datalist id="crop-suggestions">
                      <option value="Alface Crespa" />
                      <option value="Alface Americana" />
                      <option value="Cebolinha" />
                      <option value="Coentro" />
                      <option value="Salsa" />
                      <option value="Rúcula" />
                      <option value="Couve-Manteiga" />
                      <option value="Rabanete" />
                      <option value="Hortelã" />
                    </datalist>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Event Date */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Data da Atividade</label>
                    <input 
                      type="date"
                      required
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
                    />
                  </div>

                  {/* Activity Type Selector */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tipo de Atividade</label>
                    <select
                      value={activityType}
                      onChange={(e) => setActivityType(e.target.value as any)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-bold text-slate-700"
                    >
                      <option value="treatment">💊 Tratamento / Praga / Rega</option>
                      <option value="fertilization">🧪 Adubação</option>
                      <option value="planting">🌱 Novo Plantio</option>
                      <option value="harvest">🧺 Colheita</option>
                      <option value="general">📝 Outras Notas Gerais</option>
                    </select>
                  </div>
                </div>

                {/* Conditional Fields based on Activity */}
                {activityType === 'treatment' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Qual Tratamento Realizado?*</label>
                    <textarea 
                      required
                      placeholder="Descreva o tratamento (ex: Capina manual, aplicação de defensivo natural de fumo contra pulgões, irrigação reforçada)"
                      value={treatmentDescription}
                      onChange={(e) => setTreatmentDescription(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
                    />
                  </div>
                )}

                {activityType === 'fertilization' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Qual Adubação Realizada?*</label>
                    <textarea 
                      required
                      placeholder="Descreva o adubo (ex: Humus de minhoca, NPK 10-10-10, adubação de cobertura com cama de aviário)"
                      value={fertilizerDescription}
                      onChange={(e) => setFertilizerDescription(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
                    />
                  </div>
                )}

                {activityType === 'planting' && (
                  <div className="grid grid-cols-2 gap-4 bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Qtd Plantada</label>
                      <input 
                        type="number"
                        placeholder="Ex: 120"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Unidade</label>
                      <select
                        value={unit}
                        onChange={(e) => setUnit(e.target.value)}
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm text-slate-700 font-medium"
                      >
                        <option value="mudas">Mudas</option>
                        <option value="unidades">Unidades</option>
                        <option value="covas">Covas</option>
                        <option value="gramas">Gramas</option>
                      </select>
                    </div>
                  </div>
                )}

                {activityType === 'harvest' && (
                  <div className="space-y-4 bg-emerald-50/40 p-4 rounded-2xl border border-emerald-100">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Qtd Colhida*</label>
                        <input 
                          type="number"
                          required
                          placeholder="Ex: 45"
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Unidade*</label>
                        <select
                          value={unit}
                          onChange={(e) => setUnit(e.target.value)}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm text-slate-700 font-bold"
                        >
                          <option value="kg">Quilos (kg)</option>
                          <option value="maços">Maços</option>
                          <option value="cabeças">Cabeças (un)</option>
                          <option value="unidades">Unidades</option>
                          <option value="caixas">Caixas</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2 border-t border-emerald-100/60 pt-3">
                      <label className="block text-xs font-bold text-slate-600 uppercase">Tipo de Colheita*</label>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => setBedHarvestType('partial')}
                          className={cn(
                            "flex items-center justify-center py-2.5 px-3 border rounded-xl text-xs font-bold transition-all",
                            bedHarvestType === 'partial' 
                              ? "bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-50" 
                              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                          )}
                        >
                          Parcial (manter ativo)
                        </button>
                        <button
                          type="button"
                          onClick={() => setBedHarvestType('final')}
                          className={cn(
                            "flex items-center justify-center py-2.5 px-3 border rounded-xl text-xs font-bold transition-all",
                            bedHarvestType === 'final' 
                              ? "bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-50" 
                              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                          )}
                        >
                          Final (encerrar canteiro)
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium leading-normal mt-1">
                        {bedHarvestType === 'partial' 
                          ? '✓ O canteiro continua "Em Crescimento" e novos registros de colheita poderão ser feitos.' 
                          : '✓ O canteiro será encerrado e marcado como concluído.'
                        }
                      </p>
                    </div>
                  </div>
                )}

                {/* Responsible employee */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Funcionário / Responsável</label>
                  <input 
                    type="text"
                    required
                    placeholder="Nome de quem realizou a atividade"
                    value={employeeName}
                    onChange={(e) => setEmployeeName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
                  />
                </div>

                {/* Additional Notes */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Observações Adicionais</label>
                  <textarea 
                    placeholder="Registre qualquer sintoma observado, infestação, qualidade da terra ou temperatura"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
                  />
                </div>

                {/* Smart Integration Toggle */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/50 flex items-start gap-3">
                  <div className="flex items-center h-5">
                    <input 
                      id="autoSync" 
                      type="checkbox"
                      checked={autoSync}
                      onChange={(e) => setAutoSync(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer"
                    />
                  </div>
                  <div className="flex-1">
                    <label htmlFor="autoSync" className="block text-xs font-bold text-slate-700 uppercase cursor-pointer">
                      💡 Integração Automática com Sistema
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {activityType === 'planting' && "Criará automaticamente um ciclo de cultivo ativo em 'Produção' com status 'crescendo'."}
                      {activityType === 'treatment' && "Adicionará uma atividade de manejo ao ciclo ativo de " + (crop ? `[${crop}]` : "cultura") + " no " + (bedId ? `[${bedId}]` : "canteiro") + "."}
                      {activityType === 'fertilization' && "Adicionará uma adubação aos custos/manejos do cultivo ativo de " + (crop ? `[${crop}]` : "cultura") + " no " + (bedId ? `[${bedId}]` : "canteiro") + "."}
                      {activityType === 'harvest' && "Encerrará o ciclo de cultivo de " + (crop ? `[${crop}]` : "cultura") + " no " + (bedId ? `[${bedId}]` : "canteiro") + " e atualizará o Estoque de Expedição com a quantidade colhida!"}
                      {activityType === 'general' && "Grava apenas notas clínicas históricas sobre a saúde física do canteiro."}
                    </p>
                  </div>
                </div>

                {/* Submit Panel */}
                <div className="pt-2 flex gap-3">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-emerald-500/15 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {isSubmitting ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 size={18} />
                        Gravar Prontuário
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-5 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl font-bold transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </div> {/* Fim dos Elementos visíveis no App (print:hidden) */}

      {/* Modal de Configuração de Impressão de Formulários Físicos */}
      <AnimatePresence>
        {isPrintModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPrintModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                    <Printer size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Imprimir Formulários de Campo</h3>
                    <p className="text-xs text-slate-500">Gere tabelas em papel para preenchimento manual no campo</p>
                  </div>
                </div>
                <button onClick={() => setPrintModalOpen(false)} className="p-1 px-2 text-slate-400 hover:text-slate-600 rounded-lg transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
                {/* Select form style */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Selecione o Modelo de Ficha</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPrintFormType('daily')}
                      className={cn(
                        "flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all",
                        printFormType === 'daily' 
                          ? "border-emerald-600 bg-emerald-50/30 text-emerald-900" 
                          : "border-slate-200 hover:border-slate-300 bg-white text-slate-700"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                        <span className="font-bold text-sm">Ficha Diária (Multicanteiro)</span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed mt-1">
                        Tabela geral ideal para colocar em prancheta técnica e fazer anotações de várias atividades ao longo do dia em toda a horta.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPrintFormType('clinical')}
                      className={cn(
                        "flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all",
                        printFormType === 'clinical' 
                          ? "border-emerald-600 bg-emerald-50/30 text-emerald-900" 
                          : "border-slate-200 hover:border-slate-300 bg-white text-slate-700"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-emerald-600" />
                        <span className="font-bold text-sm">Prontuário (Individual)</span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed mt-1">
                        Histórico sequencial focado em acompanhar de perto os diagnósticos e tratamentos de um único canteiro ao longo do tempo.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Conditional fields based on type */}
                {printFormType === 'clinical' && (
                  <div className="space-y-2 p-4 bg-slate-50 rounded-xl border border-slate-200/50">
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Escolha o Canteiro para o Prontuário</label>
                    <select
                      value={printBedName}
                      onChange={(e) => setPrintBedName(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none font-medium"
                    >
                      <option value="blank">-- Em Branco / Preencher à Mão --</option>
                      {allBeds.map(bed => (
                        <option key={bed} value={bed}>{bed}</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-slate-500 leading-normal mt-1">
                      Selecione um canteiro ativo ou escolha 'Em Branco' para gerar o design de prontuário vazio e escrever o canteiro e a cultura de próprio punho no campo.
                    </p>
                  </div>
                )}

                {printFormType === 'daily' && (
                  <div className="p-4 bg-emerald-50/40 rounded-xl border border-emerald-100 flex items-start gap-3">
                    <div className="w-5 h-5 bg-emerald-100 rounded text-emerald-700 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                      i
                    </div>
                    <div>
                      <p className="text-xs font-bold text-emerald-800">Dica Prática para Organização</p>
                      <p className="text-[11px] text-emerald-700 leading-relaxed mt-0.5">
                        A ficha técnica diária gerada conterá uma listagem sequencial dos seus canteiros com as culturas atualmente integradas no sistema pré-impressas, agilizando muito a anotação manual!
                      </p>
                    </div>
                  </div>
                )}

                {/* Instructions */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Procedimento Recomendado</p>
                  <ol className="text-xs text-slate-600 space-y-1.5 list-decimal pl-4">
                    <li>Selecione as opções acima e clique em <strong>Gerar e Imprimir</strong>.</li>
                    <li>Sua tela de impressão nativa abrirá. Altere o destino para <strong>"Salvar como PDF"</strong> se preferir guardar em arquivo ou mande para a impressora.</li>
                    <li>Dê o papel impresso para seus operadores preencherem em campo.</li>
                    <li>Por fim, basta usar o botão digital <strong>"Novo Registro de Canteiro"</strong> para digitar e lançar as anotações no celular de forma permanente!</li>
                  </ol>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPrintModalOpen(false);
                      setTimeout(() => {
                        window.print();
                      }, 250);
                    }}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-sm"
                  >
                    <Printer size={16} />
                    Gerar e Imprimir
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintModalOpen(false)}
                    className="px-5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl transition-all text-sm"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ----------------- SEÇÃO EMISSORA DE IMPRESSOS (EXCLUSIVA PARA PAPEL) ----------------- */}
      <div className="hidden print:block font-sans text-black bg-white w-full p-2">
        {printFormType === 'daily' ? (
          /* ================= DIÁRIO DE CAMPO DIÁRIO ================= */
          <div className="space-y-6">
            <div className="border-b-4 border-black pb-4 flex justify-between items-end">
              <div>
                <h1 className="text-xl font-bold uppercase tracking-wider text-black">HortaManager • Diário de Atividades do Campo</h1>
                <p className="text-xs text-zinc-600 mt-1">Formulário Técnico para Coleta Manual de Prontuários (Preenchimento em Campo)</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold border border-black p-1">REDE FÍSICA DE CAMPO</p>
                <p className="text-[10px] text-zinc-500 mt-1">Versão Comercial 2026</p>
              </div>
            </div>

            {/* Cabeçalho Manual */}
            <div className="grid grid-cols-2 gap-4 border border-black p-4 text-xs font-semibold">
              <div className="space-y-3">
                <div>Data: _____ / _____ / _________</div>
                <div>Nome do Operador: _____________________________________</div>
              </div>
              <div className="space-y-3">
                <div>Turno: [  ] Manhã    [  ] Tarde    [  ] Dia Todo</div>
                <div>Condição Clima: [  ] Ensolarado  [  ] Chuvoso  [  ] Nublado</div>
              </div>
            </div>

            <p className="text-[11px] font-medium text-zinc-600 leading-normal">
              Instruções: Assinale as operações executadas no canteiro e escreva os insumos aplicados, pragas detectadas ou dosagens no campo "Notas Clínicas". Depois, digite os dados no app.
            </p>

            {/* Tabela de Lançamento */}
            <table className="w-full border-collapse border border-black text-[11px]">
              <thead>
                <tr className="bg-zinc-100 border-b border-black font-semibold">
                  <th className="border border-black p-2 text-left w-24">Canteiro</th>
                  <th className="border border-black p-2 text-left w-32">Cultura Ativa</th>
                  <th className="border border-black p-2 text-left w-44">Atividade Realizada</th>
                  <th className="border border-black p-2 text-left">Prescrição / Insumos Aplicados & Notas Clínicas</th>
                  <th className="border border-black p-2 text-center w-24">Quantidade / Visto</th>
                </tr>
              </thead>
              <tbody>
                {allBeds.slice(0, 15).map((bedItem, index) => {
                  const status = getBedStatus(bedItem);
                  return (
                    <tr key={index} className="h-16 border-b border-black">
                      <td className="border border-black p-2 font-bold bg-zinc-50">{bedItem}</td>
                      <td className="border border-black p-2 italic text-zinc-700">
                        {status.status === 'growing' ? status.crop : '_________________'}
                      </td>
                      <td className="border border-black p-1 text-[9px] leading-tight space-y-1">
                        <div className="flex items-center gap-1">
                          <span className="w-3.5 h-3.5 border border-black rounded-sm inline-block"></span>
                          <span>🌱 Plantio / Semeadura</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="w-3.5 h-3.5 border border-black rounded-sm inline-block"></span>
                          <span>💊 Tratamento (Defensivos)</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="w-3.5 h-3.5 border border-black rounded-sm inline-block"></span>
                          <span>🧪 Adubação / Nutrição</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="w-3.5 h-3.5 border border-black rounded-sm inline-block"></span>
                          <span>🧺 Colheita / Poda</span>
                        </div>
                      </td>
                      <td className="border border-black p-2 text-zinc-400 relative"></td>
                      <td className="border border-black p-2 text-center text-zinc-400 text-[10px]">
                        _____ qtde.<br/>
                        _____ visto
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Rodapé de Encerramento */}
            <div className="pt-8 border-t border-black flex justify-between items-center text-[10px] text-zinc-500">
              <p>Gerado pelo HortaManager • Impresso em {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
              <div className="flex gap-4">
                <span>Visto Supervisor: ___________________________</span>
                <span>Página 1 de 1</span>
              </div>
            </div>
          </div>
        ) : (
          /* ================= PRONTUÁRIO CLÍNICO INDIVIDUAL DO CANTEIRO ================= */
          <div className="space-y-4 print:space-y-3">
            <div className="border-b-4 border-black pb-3 flex justify-between items-end">
              <div>
                <h1 className="text-lg font-bold uppercase tracking-wider text-black">Prontuário Individual do Canteiro</h1>
                <p className="text-xs text-zinc-600 mt-0.5">Histórico Clínico Físico para Acompanhamento Local</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-extrabold border-2 border-black px-2.5 py-0.5 bg-black text-white">
                  {printBedName === 'blank' ? 'CANTEIRO: ______' : printBedName.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Seção Clínica do Canteiro */}
            <div className="grid grid-cols-2 gap-3 border border-black p-3 text-xs font-semibold">
              <div className="space-y-2">
                <div>Cultura Principal: ____________________________________</div>
                <div>Lote / Origem (Mudas / Sementes): __________________________</div>
                <div>Quantidade Plantada: _________________ unidades no canteiro</div>
              </div>
              <div className="space-y-2">
                <div>Data do Plantio: _____ / _____ / _________</div>
                <div>Previsão Estimada de Colheita: _____ / _____ / _________</div>
                <div>Frequência de Rega: [  ] Única diária  [  ] Dupla diária  [  ] Gotejador</div>
              </div>
            </div>

            <div className="bg-zinc-100 p-2.5 border border-black text-xs font-semibold">
              Sintomas Clínicos Iniciais / Qualidade do Solo:
              <div className="mt-2 text-zinc-400">____________________________________________________________________________________________________</div>
            </div>

            {/* Tabela de Observações Clínicas Sequenciais */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider mb-1.5">Relatório Sequencial de Manejos Técnicos e Diagnósticos (Preenchimento à Caneta)</p>
              <table className="w-full border-collapse border border-black text-xs">
                <thead>
                  <tr className="bg-zinc-100 border-b border-black font-semibold">
                    <th className="border border-black p-1.5 text-left w-24">Data / Hora</th>
                    <th className="border border-black p-1.5 text-left w-44">Atividade Realizada</th>
                    <th className="border border-black p-1.5 text-left">Diagnóstico Técnico, Prescrição Aplicada e Detalhes</th>
                    <th className="border border-black p-1.5 text-center w-24">Visto</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Generate 5 blank rows for sequential writing (optimised for 1 page) */}
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="h-12 border-b border-black">
                      <td className="border border-black p-1 text-center text-zinc-300">___/___/___</td>
                      <td className="border border-black p-1 text-[9px] leading-tight space-y-0.5">
                        <div className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 border border-black rounded-sm inline-block"></span>
                          <span>Plantio/Transpl.</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 border border-black rounded-sm inline-block"></span>
                          <span>Tratam./Remédio</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 border border-black rounded-sm inline-block"></span>
                          <span>Adubo/Nutrientes</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 border border-black rounded-sm inline-block"></span>
                          <span>Colheita/Poda</span>
                        </div>
                      </td>
                      <td className="border border-black p-1 text-zinc-300"></td>
                      <td className="border border-black p-1 text-center text-zinc-400 font-bold">______</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Histórico Anterior Recente do Sistema (se aplicável) */}
            {printBedName !== 'blank' && records.filter(r => r.bedId === printBedName).length > 0 && (
              <div className="border border-zinc-300 p-2.5 rounded bg-zinc-50/50 text-[10px] space-y-1.5">
                <p className="font-bold text-zinc-800 uppercase tracking-wide">Relatórios Históricos Recentes do App Digital:</p>
                <div className="grid grid-cols-2 gap-2 text-zinc-600">
                  {records
                    .filter(r => r.bedId === printBedName)
                    .slice(0, 2)
                    .map((rec, i) => (
                      <div key={i} className="border-b border-zinc-200 pb-1">
                        • <strong>{format(new Date(rec.date), 'dd/MM/yyyy')}</strong> - {rec.activityType.toUpperCase()}: {rec.crop} ({rec.employeeName})
                        {rec.notes && <span className="italic text-zinc-500 block">"{rec.notes}"</span>}
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Rodapé */}
            <div className="pt-4 border-t border-black flex justify-between items-center text-[10px] text-zinc-500">
              <p>Histórico de Canteiro • HortaManager</p>
              <div className="flex gap-4">
                <span>Data de Emissão: {format(new Date(), 'dd/MM/yyyy HH:mm')}</span>
                <span>Página 1 de 1</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
