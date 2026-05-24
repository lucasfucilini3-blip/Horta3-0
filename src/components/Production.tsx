import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, orderBy, where, increment, getDocs, deleteField, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Production, InventoryItem, Category, LogProduct } from '../types';
import { 
  Plus, 
  PlusCircle,
  Search, 
  Filter, 
  Calendar, 
  Sprout, 
  Trash2, 
  Edit2, 
  CheckCircle2, 
  XCircle, 
  ClipboardList, 
  Package, 
  MapPin, 
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Clock,
  Zap,
  TrendingUp,
  Droplets,
  Thermometer,
  Maximize2,
  ShoppingBag,
  ArrowUpDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth, handleFirestoreError, OperationType } from '../App';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function ProductionComponent() {
  const { profile } = useAuth();
  const [productions, setProductions] = useState<Production[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setModalOpen] = useState(false);
  const [isQuickInputModalOpen, setQuickInputModalOpen] = useState(false);
  const [isLogModalOpen, setLogModalOpen] = useState(false);
  const [isHarvestModalOpen, setHarvestModalOpen] = useState(false);
  const [isProcessModalOpen, setProcessModalOpen] = useState(false);
  const [focusedProduction, setFocusedProduction] = useState<Production | null>(null);
  const [selectedProduction, setSelectedProduction] = useState<Production | null>(null);
  const [editingLogIndex, setEditingLogIndex] = useState<number | null>(null);
  const [selectedLogProducts, setSelectedLogProducts] = useState<LogProduct[]>([]);
  const [selectedProcessInputs, setSelectedProcessInputs] = useState<LogProduct[]>([]);
  const [selectedPlantingInputs, setSelectedPlantingInputs] = useState<LogProduct[]>([]);
  const [activeTab, setActiveTab] = useState<'seedling' | 'bed' | 'processed'>('bed');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'harvest' | 'planting'>('harvest');

  useEffect(() => {
    const q = query(collection(db, 'production'), orderBy('plantingDate', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newProductions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Production));
      setProductions(newProductions);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'production');
    });

    const invQ = query(collection(db, 'inventory'), orderBy('name', 'asc'));
    const invUnsubscribe = onSnapshot(invQ, (snapshot) => {
      setInventory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem)));
    });

    return () => { unsubscribe(); invUnsubscribe(); };
  }, []);

  const handleEditProduction = (p: Production) => {
    setSelectedProduction(p);
    setFormProductionType(p.productionType || 'bed');
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const crop = formData.get('crop') as string;
    const bed = formData.get('bed') as string || (formProductionType === 'seedling' ? 'Estufa' : 'Canteiro');
    const plantingDate = new Date(formData.get('plantingDate') as string);
    const transplantDateStr = formData.get('transplantDate') as string;
    const estimatedHarvestDateStr = formData.get('estimatedHarvestDate') as string;
    const quantityPlanted = Number(formData.get('quantityPlanted'));
    const unit = formData.get('unit') as string;
    const plantingSource = formData.get('plantingSource') as string;
    const transplantDate = transplantDateStr ? new Date(transplantDateStr) : null;
    const estimatedHarvestDate = estimatedHarvestDateStr ? new Date(estimatedHarvestDateStr) : null;
    const isContinuousHarvest = formData.get('isContinuousHarvest') === 'true';

    if (selectedProduction) {
      // Update existing production
      try {
        await updateDoc(doc(db, 'production', selectedProduction.id), {
          crop,
          bed,
          plantingDate,
          transplantDate,
          estimatedHarvestDate,
          quantityPlanted,
          unit,
          isContinuousHarvest,
          productionType: formProductionType,
          plantingSource: formPlantingSource
        });
        
        if (focusedProduction?.id === selectedProduction.id) {
          setFocusedProduction({
            ...focusedProduction,
            crop,
            bed,
            plantingDate,
            transplantDate,
            estimatedHarvestDate,
            quantityPlanted,
            unit,
            productionType: formProductionType,
            plantingSource: formPlantingSource
          });
        }
        
        setModalOpen(false);
        setSelectedProduction(null);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'production');
      }
      return;
    }

    // New production logic
    let initialCost = 0;
    const inputsWithCost = selectedPlantingInputs.map(p => {
      const invItem = inventory.find(i => i.id === p.itemId);
      const costAtTime = invItem?.costPrice || 0;
      const totalItemCost = costAtTime * p.quantity;
      initialCost += totalItemCost;
      return { ...p, costAtTime };
    });

    const initialLogDescription = 
      formProductionType === 'seedling' ? 'Semeadura inicial (Viveiro)' :
      plantingSource === 'purchased_seedlings' ? 'Plantio de mudas compradas' :
      plantingSource === 'internal_seedlings' ? 'Plantio de mudas próprias' :
      'Semeadura direta no campo';

    const initialLog = {
      date: plantingDate,
      description: initialLogDescription,
      products: inputsWithCost
    };

    const data = {
      crop,
      bed,
      plantingDate,
      transplantDate,
      estimatedHarvestDate,
      quantityPlanted,
      unit,
      inputsUsed: selectedPlantingInputs.map(p => p.name),
      isContinuousHarvest,
      productionType: formProductionType,
      plantingSource: formProductionType === 'bed' ? plantingSource : 'seeds',
      logs: [initialLog],
      status: 'growing',
      totalCost: initialCost,
      unitCost: 0,
      createdAt: serverTimestamp(),
    };

    try {
      // Decrement inventory for each input used at planting
      for (const input of selectedPlantingInputs) {
        const invRef = doc(db, 'inventory', input.itemId);
        await updateDoc(invRef, {
          quantity: increment(-input.quantity),
          lastUpdated: serverTimestamp()
        });
      }

      await addDoc(collection(db, 'production'), data);
      setModalOpen(false);
      setSelectedPlantingInputs([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'production');
    }
  };

  const handleDeleteLog = async (production: Production, index: number) => {
    if (!window.confirm('Tem certeza que deseja excluir este registro de manejo? O estoque e custos serão estornados.')) return;

    try {
      const log = production.logs[index];
      const logCost = (log.products || []).reduce((acc, p) => acc + ((p.costAtTime || 0) * (p.quantity || 0)), 0);

      if (log.products) {
        for (const product of log.products) {
          const invRef = doc(db, 'inventory', product.itemId);
          await updateDoc(invRef, {
            quantity: increment(product.quantity),
            lastUpdated: serverTimestamp()
          });
        }
      }

      const updatedLogs = [...production.logs];
      updatedLogs.splice(index, 1);

      await updateDoc(doc(db, 'production', production.id), {
        logs: updatedLogs,
        totalCost: increment(-logCost)
      });
      
      if (focusedProduction?.id === production.id) {
        setFocusedProduction({ ...production, logs: updatedLogs, totalCost: production.totalCost - logCost });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'production');
    }
  };

  const handleAddLog = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProduction) return;
    const formData = new FormData(e.currentTarget);
    
    let logCost = 0;
    const productsWithCost = selectedLogProducts.map(p => {
      const invItem = inventory.find(i => i.id === p.itemId);
      const costAtTime = invItem?.costPrice || 0;
      const totalItemCost = costAtTime * p.quantity;
      logCost += totalItemCost;
      return { ...p, costAtTime };
    });

    const newLog: any = {
      date: new Date(formData.get('date') as string),
      description: formData.get('description') as string,
      products: productsWithCost
    };

    try {
      // If editing, first revert previous inventory impacts
      if (editingLogIndex !== null) {
        const oldLog = selectedProduction.logs[editingLogIndex];
        const oldCost = (oldLog.products || []).reduce((acc, p) => acc + ((p.costAtTime || 0) * (p.quantity || 0)), 0);

        // Revert old inventory
        if (oldLog.products) {
          for (const product of oldLog.products) {
            const invRef = doc(db, 'inventory', product.itemId);
            await updateDoc(invRef, {
              quantity: increment(product.quantity),
              lastUpdated: serverTimestamp()
            });
          }
        }

        const updatedLogs = [...selectedProduction.logs];
        updatedLogs[editingLogIndex] = newLog;

        // Deduct new inventory
        for (const product of selectedLogProducts) {
          const invRef = doc(db, 'inventory', product.itemId);
          await updateDoc(invRef, {
            quantity: increment(-product.quantity),
            lastUpdated: serverTimestamp()
          });
        }

        await updateDoc(doc(db, 'production', selectedProduction.id), {
          logs: updatedLogs,
          totalCost: increment(logCost - oldCost)
        });
      } else {
        // Simple add case
        for (const product of selectedLogProducts) {
          const invRef = doc(db, 'inventory', product.itemId);
          await updateDoc(invRef, {
            quantity: increment(-product.quantity),
            lastUpdated: serverTimestamp()
          });
        }

        await updateDoc(doc(db, 'production', selectedProduction.id), {
          logs: [...selectedProduction.logs, newLog],
          totalCost: increment(logCost)
        });
      }

      setLogModalOpen(false);
      setSelectedProduction(null);
      setEditingLogIndex(null);
      setSelectedLogProducts([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'production');
    }
  };

  const toggleLogProduct = (item: InventoryItem) => {
    const existing = selectedLogProducts.find(p => p.itemId === item.id);
    if (existing) {
      setSelectedLogProducts(selectedLogProducts.filter(p => p.itemId !== item.id));
    } else {
      setSelectedLogProducts([...selectedLogProducts, { 
        itemId: item.id, 
        name: item.name, 
        quantity: 1, 
        unit: item.unit 
      }]);
    }
  };

  const updateLogProductQuantity = (itemId: string, quantity: number) => {
    setSelectedLogProducts(selectedLogProducts.map(p => 
      p.itemId === itemId ? { ...p, quantity } : p
    ));
  };

  const togglePlantingInput = (item: InventoryItem) => {
    const existing = selectedPlantingInputs.find(p => p.itemId === item.id);
    if (existing) {
      setSelectedPlantingInputs(selectedPlantingInputs.filter(p => p.itemId !== item.id));
    } else {
      setSelectedPlantingInputs([...selectedPlantingInputs, { 
        itemId: item.id, 
        name: item.name, 
        quantity: 1, 
        unit: item.unit 
      }]);
    }
  };

  const updatePlantingInputQuantity = (itemId: string, quantity: number) => {
    setSelectedPlantingInputs(selectedPlantingInputs.map(p => 
      p.itemId === itemId ? { ...p, quantity } : p
    ));
  };

  const handleHarvest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProduction) return;
    const formData = new FormData(e.currentTarget);
    const harvestQuantity = Number(formData.get('harvestQuantity'));
    const harvestDate = new Date(formData.get('harvestDate') as string);

    try {
      const totalCost = selectedProduction.totalCost || 0;
      const unitCost = harvestQuantity > 0 ? totalCost / harvestQuantity : 0;

      await updateDoc(doc(db, 'production', selectedProduction.id), {
        status: 'harvested',
        harvestQuantity,
        remainingQuantity: harvestQuantity,
        harvestDate,
        unitCost
      });

      // 3. Add/Update the harvested product in inventory (Expedição)
      const invQ = query(collection(db, 'inventory'), where('name', '==', selectedProduction.crop));
      const invSnap = await getDocs(invQ);
      
      if (!invSnap.empty) {
        const existingDoc = invSnap.docs[0];
        const existingData = existingDoc.data();
        // Weighted average for costPrice
        const currentQty = existingData.quantity || 0;
        const currentCost = existingData.costPrice || 0;
        const newTotalCost = (currentQty * currentCost) + (harvestQuantity * unitCost);
        const newQty = currentQty + harvestQuantity;
        const newAvgCost = newQty > 0 ? newTotalCost / newQty : 0;

        await updateDoc(doc(db, 'inventory', existingDoc.id), {
          quantity: increment(harvestQuantity),
          type: 'dispatch',
          lastUpdated: serverTimestamp(),
          costPrice: newAvgCost
        });

        await addDoc(collection(db, 'inventory_history'), {
          itemId: existingDoc.id,
          itemName: selectedProduction.crop,
          quantity: harvestQuantity,
          unit: selectedProduction.unit,
          costPrice: unitCost,
          price: existingData.price || 0,
          type: 'harvest',
          description: `Entrada via colheita (Canteiro: ${selectedProduction.bed})`,
          date: serverTimestamp()
        });
      } else {
        const docRef = await addDoc(collection(db, 'inventory'), {
          name: selectedProduction.crop,
          type: 'dispatch',
          category: 'produce',
          quantity: harvestQuantity,
          unit: selectedProduction.unit,
          price: 0, // User will set this in Inventory
          costPrice: unitCost,
          minStock: 0,
          lastUpdated: serverTimestamp()
        });

        await addDoc(collection(db, 'inventory_history'), {
          itemId: docRef.id,
          itemName: selectedProduction.crop,
          quantity: harvestQuantity,
          unit: selectedProduction.unit,
          costPrice: unitCost,
          price: 0,
          type: 'harvest',
          description: `Entrada via colheita (Canteiro: ${selectedProduction.bed})`,
          date: serverTimestamp()
        });
      }

      setHarvestModalOpen(false);
      setSelectedProduction(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'production');
    }
  };

  const handleProcess = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProduction) return;
    const formData = new FormData(e.currentTarget);
    const sourceQuantityUsed = Number(formData.get('sourceQuantityUsed'));
    const newProductName = formData.get('newProductName') as string;
    const newProductQuantity = Number(formData.get('newProductQuantity'));
    const newProductUnit = formData.get('newProductUnit') as string;
    const newProductPrice = Number(formData.get('newProductPrice'));

    try {
      // Calculate costs
      const sourceUnitCost = selectedProduction.unitCost || 0;
      const sourceTotalCost = sourceQuantityUsed * sourceUnitCost;
      
      let inputsTotalCost = 0;
      const productsWithCost = selectedProcessInputs.map(p => {
        const invItem = inventory.find(i => i.id === p.itemId);
        const costAtTime = invItem?.costPrice || 0;
        const totalItemCost = costAtTime * p.quantity;
        inputsTotalCost += totalItemCost;
        return { ...p, costAtTime };
      });

      const finalTotalCost = sourceTotalCost + inputsTotalCost;
      const finalUnitCost = newProductQuantity > 0 ? finalTotalCost / newProductQuantity : 0;

      // 1. Decrement source production remainingQuantity
      await updateDoc(doc(db, 'production', selectedProduction.id), {
        remainingQuantity: increment(-sourceQuantityUsed)
      });

      // 2. Decrement inventory inputs
      for (const input of selectedProcessInputs) {
        const invRef = doc(db, 'inventory', input.itemId);
        await updateDoc(invRef, {
          quantity: increment(-input.quantity),
          lastUpdated: serverTimestamp()
        });

        const invItem = inventory.find(i => i.id === input.itemId);
        await addDoc(collection(db, 'inventory_history'), {
          itemId: input.itemId,
          itemName: input.name,
          quantity: -input.quantity,
          unit: input.unit || '',
          costPrice: invItem?.costPrice || 0,
          price: invItem?.price || 0,
          type: 'use_processing',
          description: `Consumo para processamento de ${newProductName}`,
          date: serverTimestamp()
        });
      }

      // 3. Add/Update the processed product in inventory
      const invQ = query(collection(db, 'inventory'), where('name', '==', newProductName));
      const invSnap = await getDocs(invQ);
      
      if (!invSnap.empty) {
        const existingDoc = invSnap.docs[0];
        const existingData = existingDoc.data();
        // Weighted average for costPrice? Or just update to latest? 
        // Let's use weighted average if possible, or just latest for simplicity as requested "formar o custo"
        await updateDoc(doc(db, 'inventory', existingDoc.id), {
          quantity: increment(newProductQuantity),
          type: 'dispatch',
          lastUpdated: serverTimestamp(),
          price: newProductPrice || existingData.price,
          costPrice: finalUnitCost
        });

        await addDoc(collection(db, 'inventory_history'), {
          itemId: existingDoc.id,
          itemName: newProductName,
          quantity: newProductQuantity,
          unit: newProductUnit,
          costPrice: finalUnitCost,
          price: newProductPrice || existingData.price || 0,
          type: 'processing_entry',
          description: `Entrada via processamento de ${sourceQuantityUsed} ${selectedProduction.unit} de ${selectedProduction.crop}`,
          date: serverTimestamp()
        });
      } else {
        // Ensure category exists
        const catQ = query(collection(db, 'categories'), where('name', '==', 'Processados'), where('type', '==', 'inventory'));
        const catSnap = await getDocs(catQ);
        if (catSnap.empty) {
          await addDoc(collection(db, 'categories'), { name: 'Processados', type: 'inventory' });
        }

        const docRef = await addDoc(collection(db, 'inventory'), {
          name: newProductName,
          type: 'dispatch',
          category: 'Processados',
          quantity: newProductQuantity,
          unit: newProductUnit,
          price: newProductPrice,
          costPrice: finalUnitCost,
          lastUpdated: serverTimestamp(),
          minStock: 0
        });

        await addDoc(collection(db, 'inventory_history'), {
          itemId: docRef.id,
          itemName: newProductName,
          quantity: newProductQuantity,
          unit: newProductUnit,
          costPrice: finalUnitCost,
          price: newProductPrice,
          type: 'processing_entry',
          description: `Entrada via processamento de ${sourceQuantityUsed} ${selectedProduction.unit} de ${selectedProduction.crop}`,
          date: serverTimestamp()
        });
      }

      // 4. Record expense for inputs (if we had costs)
      // For now, just a log in the production
      const processLog = {
        date: new Date(),
        description: `Processamento: ${sourceQuantityUsed} ${selectedProduction.unit} transformados em ${newProductQuantity} ${newProductUnit} de ${newProductName}.`,
        products: productsWithCost
      };

      await updateDoc(doc(db, 'production', selectedProduction.id), {
        logs: [...selectedProduction.logs, processLog]
      });

      setProcessModalOpen(false);
      setSelectedProduction(null);
      setSelectedProcessInputs([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'production');
    }
  };

  const toggleProcessInput = (item: InventoryItem) => {
    const existing = selectedProcessInputs.find(p => p.itemId === item.id);
    if (existing) {
      setSelectedProcessInputs(selectedProcessInputs.filter(p => p.itemId !== item.id));
    } else {
      setSelectedProcessInputs([...selectedProcessInputs, { 
        itemId: item.id, 
        name: item.name, 
        quantity: 1, 
        unit: item.unit 
      }]);
    }
  };

  const updateProcessInputQuantity = (itemId: string, quantity: number) => {
    setSelectedProcessInputs(selectedProcessInputs.map(p => 
      p.itemId === itemId ? { ...p, quantity } : p
    ));
  };

  const markAsLost = async (id: string) => {
    if (!confirm('Deseja marcar esta produção como perdida?')) return;
    try {
      await updateDoc(doc(db, 'production', id), { status: 'lost' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'production');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir registro de produção?')) return;
    try {
      await deleteDoc(doc(db, 'production', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'production');
    }
  };

  const handleQuickInputSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      type: 'input',
      category: formData.get('category') as string,
      quantity: Number(formData.get('quantity')),
      unit: formData.get('unit') as string,
      costPrice: Number(formData.get('costPrice')) || 0,
      minStock: 0,
      lastUpdated: serverTimestamp(),
    };

    try {
      const docRef = await addDoc(collection(db, 'inventory'), data);
      
      // Auto-select the new item for the current context
      const newItem = { id: docRef.id, ...data } as any;
      if (isModalOpen) {
        togglePlantingInput(newItem);
      } else if (isLogModalOpen) {
        toggleLogProduct(newItem);
      } else if (isProcessModalOpen) {
        toggleProcessInput(newItem);
      }

      setQuickInputModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory');
    }
  };

  const processedItems = inventory.filter(item => 
    item.category === 'Processados' && 
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeTabClass = "bg-white text-emerald-600 shadow-sm ring-1 ring-slate-200";
  const inactiveTabClass = "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50";

  const getDaysSincePlanting = (date: any) => {
    const plantingDate = date?.toDate ? date.toDate() : new Date(date);
    const diff = new Date().getTime() - plantingDate.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const getStatusProgress = (p: Production) => {
    if (p.status === 'harvested' || p.status === 'lost') return 100;
    
    if (p.status === 'growing') {
      const plantingDate = p.plantingDate?.toDate ? p.plantingDate.toDate() : new Date(p.plantingDate);
      const estimatedHarvestDate = p.estimatedHarvestDate?.toDate ? p.estimatedHarvestDate.toDate() : (p.estimatedHarvestDate ? new Date(p.estimatedHarvestDate) : null);
      
      if (!estimatedHarvestDate) return 0;
      
      const today = new Date();
      const totalDays = estimatedHarvestDate.getTime() - plantingDate.getTime();
      const elapsedDays = today.getTime() - plantingDate.getTime();
      
      if (totalDays <= 0) return 99; // Avoid division by zero or invalid negative duration
      
      const progress = Math.min(Math.floor((elapsedDays / totalDays) * 100), 99);
      return Math.max(progress, 0);
    }
    
    return 0;
  };

  const filteredProductions = productions
    .filter(p => {
      const matchesSearch = p.crop.toLowerCase().includes(searchTerm.toLowerCase()) || p.bed.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
      const matchesTab = activeTab === 'processed' ? false : (activeTab === 'seedling' ? p.productionType === 'seedling' : p.productionType === 'bed' || !p.productionType);
      return matchesSearch && matchesStatus && matchesTab;
    })
    .sort((a, b) => {
      // Prioritize "growing" status at the top
      if (a.status === 'growing' && b.status !== 'growing') return -1;
      if (a.status !== 'growing' && b.status === 'growing') return 1;

      if (sortBy === 'planting') {
        const plantA = a.plantingDate?.toDate ? a.plantingDate.toDate() : (a.plantingDate ? new Date(a.plantingDate) : new Date(0));
        const plantB = b.plantingDate?.toDate ? b.plantingDate.toDate() : (b.plantingDate ? new Date(b.plantingDate) : new Date(0));
        return plantB.getTime() - plantA.getTime();
      } else {
        const dateA = a.estimatedHarvestDate?.toDate ? a.estimatedHarvestDate.toDate() : (a.estimatedHarvestDate ? new Date(a.estimatedHarvestDate) : null);
        const dateB = b.estimatedHarvestDate?.toDate ? b.estimatedHarvestDate.toDate() : (b.estimatedHarvestDate ? new Date(b.estimatedHarvestDate) : null);

        if (dateA && dateB) {
          return dateA.getTime() - dateB.getTime(); // Closest date first
        }
        
        if (dateA) return -1;
        if (dateB) return 1;

        // Fallback to planting date descending
        const plantA = a.plantingDate?.toDate ? a.plantingDate.toDate() : (a.plantingDate ? new Date(a.plantingDate) : new Date(0));
        const plantB = b.plantingDate?.toDate ? b.plantingDate.toDate() : (b.plantingDate ? new Date(b.plantingDate) : new Date(0));
        return plantB.getTime() - plantA.getTime();
      }
    });

  const sortedHistoricalSeedlings = productions
    .filter(p => {
      // 1. It is a completed seedling lot (harvested or lost)
      if (p.productionType === 'seedling' && p.status !== 'growing') {
        return true;
      }
      // 2. Or it was transplanted! Current type is 'bed', but it originated from internal seedlings or has a transplantDate
      if (p.productionType === 'bed' && (p.plantingSource === 'internal_seedlings' || p.transplantDate)) {
        return true;
      }
      return false;
    })
    .sort((a, b) => {
      const aDate = a.transplantDate || a.plantingDate;
      const bDate = b.transplantDate || b.plantingDate;
      const aTime = aDate?.toDate ? aDate.toDate().getTime() : (aDate ? new Date(aDate).getTime() : 0);
      const bTime = bDate?.toDate ? bDate.toDate().getTime() : (bDate ? new Date(bDate).getTime() : 0);
      return bTime - aTime;
    });

  const quickLogs = [
    { label: 'Manejo', icon: Zap, color: 'text-emerald-500 bg-emerald-50' },
  ];

  const handleQuickLog = async (production: Production, type: string) => {
    setSelectedProduction(production);
    setLogModalOpen(true);
  };

  const handleEditLog = (production: Production, index: number) => {
    setSelectedProduction(production);
    setEditingLogIndex(index);
    const log = production.logs[index];
    setSelectedLogProducts(log.products || []);
    setLogModalOpen(true);
  };

  const [formProductionType, setFormProductionType] = useState<'seedling' | 'bed'>('bed');
  const [formPlantingSource, setFormPlantingSource] = useState<'seeds' | 'internal_seedlings' | 'purchased_seedlings'>('seeds');
  const [isTransplantModalOpen, setTransplantModalOpen] = useState(false);
  const [transplantError, setTransplantError] = useState<string | null>(null);

  const handleTransplantSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProduction) return;
    setTransplantError(null);

    const formData = new FormData(e.currentTarget);
    const destinationBed = formData.get('destinationBed') as string;
    const transplantDateStr = formData.get('transplantDate') as string;
    const estimatedHarvestDateStr = formData.get('estimatedHarvestDate') as string;
    const quantityTransplanted = Number(formData.get('quantityTransplanted'));

    const transplantDate = transplantDateStr ? new Date(transplantDateStr + 'T12:00:00') : new Date();
    const estimatedHarvestDate = estimatedHarvestDateStr ? new Date(estimatedHarvestDateStr + 'T12:00:00') : null;

    const transplantTimestamp = Timestamp.fromDate(transplantDate);
    const estimatedHarvestTimestamp = estimatedHarvestDate ? Timestamp.fromDate(estimatedHarvestDate) : null;

    try {
      // 1. Calculate seedling production costs
      const totalCost = selectedProduction.totalCost || 0;
      const unitCost = quantityTransplanted > 0 ? totalCost / quantityTransplanted : 0;

      // 2. Resolve inventory item for the crop's seedlings
      let itemId = '';
      const cropName = selectedProduction.crop || '';
      let targetItemName = `Mudas de ${cropName}`;
      const existingItem = inventory.find(item => {
        const name = item.name || '';
        return name.trim().toLowerCase() === `mudas de ${cropName}`.toLowerCase() ||
               name.trim().toLowerCase() === `muda de ${cropName}`.toLowerCase();
      });

      if (existingItem) {
        itemId = existingItem.id;
        targetItemName = existingItem.name;
        
        // Update price metrics with weighted average cost
        const currentQty = existingItem.quantity || 0;
        const currentCost = existingItem.costPrice || 0;
        const newTotalCost = (currentQty * currentCost) + (quantityTransplanted * unitCost);
        const totalQty = currentQty + quantityTransplanted;
        const newAvgCost = totalQty > 0 ? newTotalCost / totalQty : 0;

        await updateDoc(doc(db, 'inventory', itemId), {
          quantity: increment(quantityTransplanted),
          costPrice: newAvgCost,
          lastUpdated: serverTimestamp()
        });
      } else {
        // Auto-create category 'Mudas' in inventory if it does not exist
        const docRef = await addDoc(collection(db, 'inventory'), {
          name: targetItemName,
          type: 'dispatch',
          category: 'Mudas',
          quantity: quantityTransplanted,
          unit: selectedProduction.unit || 'mudas',
          price: 0,
          costPrice: unitCost,
          minStock: 0,
          lastUpdated: serverTimestamp()
        });
        itemId = docRef.id;
      }

      // 3. Register addition in the inventory history
      await addDoc(collection(db, 'inventory_history'), {
        itemId: itemId,
        itemName: targetItemName,
        quantity: quantityTransplanted,
        unit: selectedProduction.unit || 'mudas',
        costPrice: unitCost,
        price: 0,
        type: 'add_stock',
        description: `Entrada via produção de mudas (Estufa de Origem: ${selectedProduction.bed})`,
        date: serverTimestamp()
      });

      // 4. Immediately deduct the seedlings as they are planted in the canteiro (dar baixa)
      await updateDoc(doc(db, 'inventory', itemId), {
        quantity: increment(-quantityTransplanted),
        lastUpdated: serverTimestamp()
      });

      // 5. Register subtraction in the inventory history
      await addDoc(collection(db, 'inventory_history'), {
        itemId: itemId,
        itemName: targetItemName,
        quantity: -quantityTransplanted,
        unit: selectedProduction.unit || 'mudas',
        costPrice: unitCost,
        price: 0,
        type: 'use_stock',
        description: `Saída via transplante para canteiro de destino: ${destinationBed}`,
        date: serverTimestamp()
      });

      // 6. Update the production state to 'bed'
      const originalLogs = [...(selectedProduction.logs || [])];
      const seedlingLog = {
        date: transplantTimestamp,
        description: `Mudas transplantadas da estufa (${selectedProduction.bed}) para o canteiro: ${destinationBed}. Qtd real de mudas plantadas: ${quantityTransplanted} ${selectedProduction.unit}`,
        products: []
      };
      
      await updateDoc(doc(db, 'production', selectedProduction.id), {
        productionType: 'bed',
        plantingSource: 'internal_seedlings',
        bed: destinationBed,
        quantityPlanted: quantityTransplanted,
        transplantDate: transplantTimestamp,
        estimatedHarvestDate: estimatedHarvestTimestamp,
        logs: [...originalLogs, seedlingLog]
      });

      setTransplantModalOpen(false);
      setSelectedProduction(null);
    } catch (error: any) {
      console.error("Erro no transplante:", error);
      setTransplantError(error?.message || "Ocorreu um erro ao processar o transplante.");
      handleFirestoreError(error, OperationType.WRITE, 'production');
    }
  };

  const handleRevertTransplant = async (p: Production) => {
    if (!confirm('Deseja desfazer o transplante e retornar esta produção para o estágio de mudas (Estufa)?')) return;

    try {
      // Revert Inventory logs to maintain history audit trail
      const cropName = p.crop || '';
      const itemName = `Mudas de ${cropName}`;
      const existingItem = inventory.find(item => {
        const name = item.name || '';
        return name.trim().toLowerCase() === `mudas de ${cropName}`.toLowerCase() ||
               name.trim().toLowerCase() === `muda de ${cropName}`.toLowerCase();
      });

      if (existingItem) {
        const unitCost = p.totalCost && p.quantityPlanted ? p.totalCost / p.quantityPlanted : 0;

        await addDoc(collection(db, 'inventory_history'), {
          itemId: existingItem.id,
          itemName: existingItem.name,
          quantity: p.quantityPlanted,
          unit: p.unit || 'mudas',
          costPrice: unitCost,
          price: 0,
          type: 'add_stock',
          description: `Estorno de Baixa por desfazer transplante de [${p.crop}]`,
          date: serverTimestamp()
        });

        await addDoc(collection(db, 'inventory_history'), {
          itemId: existingItem.id,
          itemName: existingItem.name,
          quantity: -p.quantityPlanted,
          unit: p.unit || 'mudas',
          costPrice: unitCost,
          price: 0,
          type: 'use_stock',
          description: `Estorno de Entrada por desfazer transplante de [${p.crop}]`,
          date: serverTimestamp()
        });
      }

      // Enhanced sibling seedling matching for previous 2-record transplants
      const siblingSeedling = productions.find(other => {
        if (other.id === p.id) return false;
        
        // Trim and lowercase comparison for crop names to be extremely lenient with formatting
        if (other.crop.trim().toLowerCase() !== p.crop.trim().toLowerCase()) return false;
        
        // Sibling seedling must be 'harvested' under the old 2-record flow
        if (other.status !== 'harvested') return false;

        // Ensure it is not a bed record itself if a productionType is defined
        if (other.productionType === 'bed') return false;

        // Try to match by sowing date (plantingDate)
        const getMs = (dateVal: any) => {
          if (!dateVal) return 0;
          if (typeof dateVal.toDate === 'function') {
            try { return dateVal.toDate().getTime(); } catch (e) {}
          }
          if (dateVal.seconds) return dateVal.seconds * 1000;
          try { return new Date(dateVal).getTime(); } catch (e) {}
          return 0;
        };

        const otherTime = getMs(other.plantingDate);
        const pTime = getMs(p.plantingDate);

        // Dates match exactly or very closely (within 24 hours is typical)
        const isSameSowingDate = otherTime > 0 && pTime > 0 && Math.abs(otherTime - pTime) < 24 * 60 * 60 * 1000;

        // Or search the logs for explicit references to verify the match
        const otherLogsMentionThisBed = other.logs?.some(l => 
          l.description && l.description.toLowerCase().includes(p.bed.toLowerCase())
        ) || false;

        const pLogsMentionOtherBed = p.logs?.some(l => 
          l.description && l.description.toLowerCase().includes(other.bed.toLowerCase())
        ) || false;

        return isSameSowingDate || otherLogsMentionThisBed || pLogsMentionOtherBed;
      });

      if (siblingSeedling) {
        // Option 1: Two-record method was used.
        // We will restore the old harvested seedling record to 'growing' status, and remove this newly created 'bed' record.
        const originalLogs = [...(siblingSeedling.logs || [])];
        
        // Remove the log recording the transplant from the old seedling record
        const filteredLogs = originalLogs.filter(log => {
          const desc = log.description?.toLowerCase() || '';
          return !desc.includes('transplant') && 
                 !desc.includes('canteiro') && 
                 !desc.includes('muda') &&
                 !desc.includes('origem');
        });

        await updateDoc(doc(db, 'production', siblingSeedling.id), {
          status: 'growing',
          harvestQuantity: deleteField(),
          remainingQuantity: deleteField(),
          harvestDate: deleteField(),
          logs: filteredLogs
        });

        await deleteDoc(doc(db, 'production', p.id));

        if (focusedProduction?.id === p.id) {
          setFocusedProduction(null);
        }
        
        alert('Transplante desfeito com sucesso! A produção original de mudas na Estufa foi ativada e este canteiro foi apagado.');
        return;
      }

      // Option 2: Single-record method was used.
      let originalLogs = [...(p.logs || [])];
      let originalBed = 'Estufa';

      // Find the last log containing transplant info and remove it
      const transplantLogIndex = [...originalLogs].reverse().findIndex(log => 
        log.description && (
          log.description.includes('Mudas transplantadas') || 
          log.description.includes('Mudas próprias transplantadas') ||
          log.description.toLowerCase().includes('transplant') ||
          log.description.toLowerCase().includes('muda')
        )
      );

      if (transplantLogIndex !== -1) {
        const realIndex = originalLogs.length - 1 - transplantLogIndex;
        const log = originalLogs[realIndex];
        
        // Match the original bed name inside parentheses if available, e.g. "Mudas transplantadas da estufa (Estufa Central) para..."
        const match = log.description.match(/estufa \((.*?)\)/i) || 
                      log.description.match(/da estufa (.*?) para/i) || 
                      log.description.match(/Origem: (.*?)\)/i);
        if (match && match[1]) {
          originalBed = match[1];
        }

        // Remove the transplant log
        originalLogs.splice(realIndex, 1);
      }

      await updateDoc(doc(db, 'production', p.id), {
        productionType: 'seedling',
        plantingSource: 'seeds',
        bed: originalBed,
        transplantDate: deleteField(),
        estimatedHarvestDate: deleteField(),
        logs: originalLogs
      });

      if (focusedProduction?.id === p.id) {
        setFocusedProduction(null);
      }
      
      alert('Transplante desfeito com sucesso! Esta produção retornou para o estágio de mudas (Estufa).');
    } catch (error: any) {
      console.error(error);
      alert('Erro ao tentar desfazer transplante: ' + (error.message || error));
      handleFirestoreError(error, OperationType.WRITE, 'production');
    }
  };

  const bedSuggestions = Array.from(new Set(
    productions
      .filter(p => p.productionType === 'bed' || !p.productionType)
      .map(p => p.bed)
  )).filter(Boolean) as string[];

  return (
    <div className="space-y-6 md:space-y-8 pb-20">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900">Produção</h2>
          <p className="text-slate-500 mt-1 text-sm md:text-base">Acompanhe o ciclo de vida das suas culturas.</p>
        </div>
        <div className="flex gap-2 md:gap-3">
          <button 
            onClick={() => setProcessModalOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-amber-50 text-amber-700 border border-amber-200 px-4 md:px-6 py-3 rounded-xl font-bold hover:bg-amber-100 transition-all shadow-sm active:scale-95 text-sm md:text-base"
          >
            <Package size={18} className="md:w-5 md:h-5" />
            Processar
          </button>
          <button 
            onClick={() => setModalOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600 text-white px-4 md:px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95 text-sm md:text-base"
          >
            <Plus size={18} className="md:w-5 md:h-5" />
            Novo Plantio
          </button>
        </div>
      </header>

      {/* Tip section */}
      <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex items-start gap-4">
        <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
          <AlertCircle size={20} />
        </div>
        <div>
          <h4 className="font-bold text-blue-900 text-sm">Dica de Processamento</h4>
          <p className="text-blue-700 text-xs mt-1">
            Para criar combos (ex: bandejas de milho), primeiro registre a colheita de uma cultura. 
            Depois, use o botão <strong>"Processar / Combo"</strong> no item colhido ou no topo da página.
          </p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Buscar..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm md:text-base"
          />
        </div>
        {activeTab !== 'processed' && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="text-slate-400 shrink-0" size={20} />
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="flex-1 md:flex-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm md:text-base"
              >
                <option value="all">Todos Status</option>
                <option value="growing">Em Crescimento</option>
                <option value="harvested">Colhidos</option>
                <option value="lost">Perdidos</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <ArrowUpDown className="text-slate-400 shrink-0" size={20} />
              <select 
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'harvest' | 'planting')}
                className="flex-1 md:flex-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm md:text-base"
              >
                <option value="harvest">Ord. por Previsão de Colheita</option>
                <option value="planting">Ord. por Data de Plantio</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap bg-slate-200/50 p-1.5 rounded-2xl w-full md:w-fit mb-6 gap-1">
        <button
          onClick={() => setActiveTab('seedling')}
          className={cn(
            "flex-1 md:flex-none px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200",
            activeTab === 'seedling' ? activeTabClass : inactiveTabClass
          )}
        >
          <div className="flex items-center justify-center gap-2">
            <Sprout size={18} />
            Produção de Mudas
          </div>
        </button>
        <button
          onClick={() => setActiveTab('bed')}
          className={cn(
            "flex-1 md:flex-none px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200",
            activeTab === 'bed' ? activeTabClass : inactiveTabClass
          )}
        >
          <div className="flex items-center justify-center gap-2">
            <MapPin size={18} />
            Canteiros
          </div>
        </button>
        <button
          onClick={() => setActiveTab('processed')}
          className={cn(
            "flex-1 md:flex-none px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200",
            activeTab === 'processed' ? activeTabClass : inactiveTabClass
          )}
        >
          <div className="flex items-center justify-center gap-2">
            <Zap size={18} />
            Processados
          </div>
        </button>
      </div>

      {activeTab !== 'processed' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredProductions.map((p) => {
              const daysIn = getDaysSincePlanting(p.plantingDate);
              const progress = getStatusProgress(p);
              
              return (
                <motion.div 
                  layout
                  key={p.id} 
                  className={cn(
                    "flex flex-col bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden group relative",
                    p.status === 'lost' && "opacity-80 grayscale-[0.5]"
                  )}
                >
                  <div className="p-6 space-y-5">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <h4 className="text-xl font-black text-slate-900 truncate tracking-tight">{p.crop}</h4>
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-1.5 text-sm font-bold text-slate-500">
                            <div className="w-5 h-5 rounded-md bg-slate-100 flex items-center justify-center">
                              <MapPin size={10} className="text-slate-400" />
                            </div>
                            {p.bed}
                          </div>
                          {p.plantingSource && (
                            <div className="flex items-center gap-1 text-[9px] font-black uppercase text-slate-400 border border-slate-100 px-1.5 py-0.5 rounded-lg bg-slate-50/80">
                              {p.plantingSource === 'seeds' && <Package size={10} />}
                              {p.plantingSource === 'internal_seedlings' && <Sprout size={10} />}
                              {p.plantingSource === 'purchased_seedlings' && <ShoppingBag size={10} />}
                              {p.plantingSource === 'seeds' ? 'Semente' : p.plantingSource === 'internal_seedlings' ? 'Muda Própria' : 'Muda Comprada'}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className={cn(
                        "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border",
                        p.status === 'growing' ? "bg-emerald-50 text-emerald-600 border-emerald-100 shadow-sm shadow-emerald-50" :
                        p.status === 'harvested' ? "bg-blue-50 text-blue-600 border-blue-100 shadow-sm shadow-blue-50" :
                        "bg-rose-50 text-rose-600 border-rose-100"
                      )}>
                        {p.status === 'growing' ? 'Em Crescimento' : 
                         p.status === 'harvested' ? 'Colhido' : 'Perdido'}
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Idade</p>
                        <p className="text-lg font-black text-slate-700">{daysIn} <span className="text-xs font-bold text-slate-400">dias</span></p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Plantado</p>
                        <p className="text-lg font-black text-slate-700">{p.quantityPlanted} <span className="text-xs font-bold text-slate-400">{p.unit}</span></p>
                      </div>
                      {p.transplantDate && (
                        <div className="col-span-2 p-3 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                          <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                            <TrendingUp size={10} /> 
                            Previsão de Transplante
                          </p>
                          <p className="text-sm font-black text-indigo-700">
                            {p.transplantDate?.toDate ? format(p.transplantDate.toDate(), "dd/MM/yyyy") : format(new Date(p.transplantDate), "dd/MM/yyyy")}
                          </p>
                        </div>
                      )}
                      {p.estimatedHarvestDate && (
                        <div className="col-span-2 p-3 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                          <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                            <Calendar size={10} /> 
                            Previsão de Colheita
                          </p>
                          <p className="text-sm font-black text-emerald-700">
                            {p.estimatedHarvestDate?.toDate ? format(p.estimatedHarvestDate.toDate(), "dd/MM/yyyy") : format(new Date(p.estimatedHarvestDate), "dd/MM/yyyy")}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Lifecycle Progress */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-wider">
                        <span>Ciclo de Vida</span>
                        <span className={cn(
                          p.status === 'growing' ? "text-emerald-500" :
                          p.status === 'harvested' ? "text-blue-500" : "text-rose-500"
                        )}>{progress}%</span>
                      </div>
                      <div className="h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          className={cn(
                            "h-full rounded-full shadow-[0_0_10px_rgba(0,0,0,0.05)]",
                            p.status === 'growing' ? "bg-gradient-to-r from-emerald-400 to-emerald-600" :
                            p.status === 'harvested' ? "bg-gradient-to-r from-blue-400 to-blue-600" : "bg-rose-500"
                          )}
                        />
                      </div>
                    <div className="flex flex-col gap-3 pt-2">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => { setSelectedProduction(p); setLogModalOpen(true); }}
                          className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 active:scale-95"
                        >
                          <Zap size={14} fill="currentColor" />
                          Manejar
                        </button>
                        {p.status === 'growing' && (
                          p.productionType === 'seedling' ? (
                            <button 
                              onClick={() => { setSelectedProduction(p); setTransplantModalOpen(true); }}
                              className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 active:scale-95"
                              title="Transplantar Lote para o Campo"
                            >
                              <ArrowRight size={14} />
                              Transplantar
                            </button>
                          ) : (
                            <button 
                              onClick={() => { setSelectedProduction(p); setHarvestModalOpen(true); }}
                              className="flex items-center justify-center p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95"
                              title="Colher"
                            >
                              <CheckCircle2 size={20} />
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Log Vertical Timeline (Inside Card - Mini) */}
                  {p.logs.length > 0 && (
                    <div className="px-6 py-4 bg-slate-50/40 border-t border-slate-100 max-h-40 overflow-y-auto custom-scrollbar">
                      <div className="space-y-4">
                        {p.logs.slice().reverse().slice(0, 5).map((log, i) => {
                          const originalIndex = p.logs.length - 1 - i;
                          return (
                            <div key={i} className="group/log relative pl-6 before:absolute before:left-[7px] before:top-2 before:bottom-[-20px] before:w-[2px] before:bg-slate-200 last:before:hidden">
                              <div className="absolute left-0 top-1 w-4 h-4 rounded-full border-2 border-slate-200 bg-white flex items-center justify-center z-10">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              </div>
                              <div className="flex items-start justify-between gap-2">
                                <div className="space-y-0.5 min-w-0">
                                  <p className="text-[10px] font-bold text-slate-800 line-clamp-1">{log.description}</p>
                                  <p className="text-[9px] font-black text-slate-400 uppercase">
                                    {log.date?.toDate ? format(log.date.toDate(), "dd/MM 'às' HH:mm", { locale: ptBR }) : format(new Date(log.date), "dd/MM 'às' HH:mm")}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover/log:opacity-100 transition-all">
                                  <button 
                                    onClick={() => handleEditLog(p, originalIndex)}
                                    className="p-1 text-slate-400 hover:text-emerald-600 transition-all"
                                    title="Editar"
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteLog(p, originalIndex)}
                                    className="p-1 text-slate-400 hover:text-rose-600 transition-all"
                                    title="Excluir"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Card Options Menu (Absolute positioned for overlay) */}
                  <div className="absolute top-4 right-4 flex gap-2">
                    <button 
                      onClick={() => setFocusedProduction(p)}
                      className="flex items-center justify-center w-8 h-8 bg-white/90 hover:bg-white shadow-sm text-emerald-600 rounded-full transition-all active:scale-95"
                      title="Focar / Detalhes"
                    >
                      <Maximize2 size={14} />
                    </button>
                    <div className="relative group/more">
                      <button className="flex items-center justify-center w-8 h-8 bg-black/5 hover:bg-black/10 backdrop-blur-md text-slate-600 rounded-full transition-all">
                        <ArrowRight size={14} className="rotate-90" />
                      </button>
                      <div className="absolute top-full right-0 pt-2 w-48 hidden group-hover/more:block z-50 animate-in fade-in zoom-in-95 origin-top-right">
                        <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 py-2">
                          <button 
                              onClick={() => handleEditProduction(p)}
                              className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                              <Edit2 size={16} />
                              Editar Produção
                            </button>
                          <button 
                              onClick={() => handleDelete(p.id)}
                              className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors"
                            >
                              <Trash2 size={16} />
                              Excluir Registro
                            </button>
                            {p.status === 'growing' && (
                               <button 
                                onClick={() => markAsLost(p.id)}
                                className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                              >
                                <XCircle size={16} />
                                Marcar Perda
                              </button>
                            )}
                            {p.status === 'growing' && p.productionType === 'seedling' && (
                               <button 
                                onClick={() => { setSelectedProduction(p); setTransplantModalOpen(true); }}
                                className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                              >
                                <ArrowRight size={16} />
                                Transplantar Mudas
                              </button>
                            )}
                            {p.status === 'growing' && p.productionType === 'bed' && (p.plantingSource === 'internal_seedlings' || p.transplantDate || p.logs?.some(l => l.description && (l.description.toLowerCase().includes('transplant') || l.description.toLowerCase().includes('muda')))) && (
                               <button 
                                onClick={() => handleRevertTransplant(p)}
                                className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                              >
                                <ArrowLeft size={16} />
                                Desfazer Transplante
                              </button>
                            )}
                            {p.status === 'harvested' && (p.remainingQuantity ?? p.harvestQuantity ?? 0) > 0 && (
                               <button 
                                onClick={() => { setSelectedProduction(p); setProcessModalOpen(true); }}
                                className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-amber-50 hover:text-amber-600 transition-colors"
                              >
                                <Package size={16} />
                                Processar Cultura
                              </button>
                            )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer Stats summary */}
                  <div className="px-6 py-4 bg-white border-t border-slate-100 flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={12} />
                      <span>{p.plantingDate?.toDate ? format(p.plantingDate.toDate(), "dd.MM.yy") : format(new Date(p.plantingDate), "dd.MM.yy")}</span>
                    </div>
                    <span>{p.status === 'growing' ? (p.totalCost > 0 ? `Custo: R$ ${p.totalCost.toFixed(2)}` : 'S/ Custo') : (p.unitCost > 0 ? `Custo: R$ ${p.unitCost.toFixed(2)}` : 'S/ Custo')}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {filteredProductions.length === 0 && (
            <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 mb-8">
              <Sprout size={48} className="mx-auto text-slate-300 mb-4 animate-pulse" />
              <p className="text-slate-500 font-bold text-sm md:text-base">Nenhum lote ativo em cultivo encontrado no momento.</p>
              <p className="text-slate-400 text-xs mt-1">Inicie um novo plantio pressionando o botão "Novo Plantio" acima.</p>
            </div>
          )}

          {/* Histórico de Semeadura e Mudas (Exclusivo da aba de Mudas) */}
          {activeTab === 'seedling' && (
            <div className="mt-12 bg-white rounded-[2rem] border border-slate-200 p-6 md:p-8 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                    <ClipboardList size={22} className="text-emerald-600" />
                    Histórico de Semeadura e Mudas
                  </h3>
                   <p className="text-slate-500 text-xs mt-1">Lotes de sementes semeadas e mudas que já foram transplantadas ou finalizadas.</p>
                </div>
                <span className="self-start sm:self-center px-4 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 rounded-full text-xs font-bold">
                  {sortedHistoricalSeedlings.length} {sortedHistoricalSeedlings.length === 1 ? 'registro' : 'registros'}
                </span>
              </div>

              {sortedHistoricalSeedlings.length === 0 ? (
                <div className="text-center py-12 text-slate-400 italic bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                  Nenhum histórico de transplante ou semeaduras concluídas no momento.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-3xl border border-slate-100">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/60 border-b border-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-wider">
                        <th className="py-4 px-6">Cultura / Lote</th>
                        <th className="py-4 px-6">Semeado em</th>
                        <th className="py-4 px-6">Status / Transplante</th>
                        <th className="py-4 px-6">Custo Un. Est.</th>
                        <th className="py-4 px-6">Canteiro de Destino</th>
                        <th className="py-4 px-6 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs md:text-sm">
                      {sortedHistoricalSeedlings.map((p) => {
                        const sDate = p.plantingDate?.toDate ? p.plantingDate.toDate() : (p.plantingDate ? new Date(p.plantingDate) : null);
                        const tDate = p.transplantDate?.toDate ? p.transplantDate.toDate() : (p.transplantDate ? new Date(p.transplantDate) : null);
                        
                        // Extract original nursery/bed if available
                        let originalNursery = "Estufa";
                        const transplantLog = p.logs?.find(l => {
                          const desc = l.description?.toLowerCase() || '';
                          return desc.includes('transplant') || desc.includes('muda') || desc.includes('semeadura');
                        });
                        if (transplantLog) {
                          const match = transplantLog.description.match(/estufa \((.*?)\)/i) || transplantLog.description.match(/da estufa (.*?) para/i) || transplantLog.description.match(/Origem: (.*?)\)/i);
                          if (match && match[1]) {
                            originalNursery = match[1];
                          }
                        }

                        const transplantedQty = p.quantityPlanted;
                        const totalCost = p.totalCost || 0;
                        const seedlingUnitCost = transplantedQty > 0 ? totalCost / transplantedQty : 0;

                        return (
                          <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="py-4 px-6 font-bold text-slate-900">
                              <div className="flex items-center gap-2">
                                <Sprout size={16} className="text-emerald-500 shrink-0" />
                                <div>
                                  <p className="font-bold text-slate-900">{p.crop}</p>
                                  <p className="text-[10px] text-slate-400 font-medium">Origem: {originalNursery}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-6 text-slate-500 font-medium whitespace-nowrap">
                              {sDate ? format(sDate, "dd/MM/yyyy") : 'N/A'}
                            </td>
                            <td className="py-4 px-6 whitespace-nowrap">
                              {p.productionType === 'bed' ? (
                                <div className="space-y-0.5">
                                  <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg px-2 py-0.5 text-[10px] font-black uppercase animate-fade-in">
                                    <ArrowRight size={10} />
                                    Transplantado
                                  </span>
                                  {tDate && (
                                    <p className="text-[10px] text-slate-400 font-bold">
                                      {format(tDate, "dd/MM/yyyy")} ({transplantedQty} {p.unit})
                                    </p>
                                  )}
                                </div>
                              ) : p.status === 'harvested' ? (
                                <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg px-2 py-0.5 text-[10px] font-black uppercase">
                                  Concluído (Colhido)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-100 rounded-lg px-2 py-0.5 text-[10px] font-black uppercase">
                                  Perda Registrada
                                </span>
                              )}
                            </td>
                             <td className="py-4 px-6 font-mono font-bold text-slate-700">
                              {seedlingUnitCost > 0 ? `R$ ${seedlingUnitCost.toFixed(2)}` : 'S/ Custo'}
                            </td>
                            <td className="py-4 px-6 font-bold text-indigo-600">
                              {p.productionType === 'bed' ? p.bed : '-'}
                            </td>
                            <td className="py-4 px-6 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={() => setFocusedProduction(p)}
                                  className="px-3 py-1.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 font-bold rounded-xl text-xs transition-colors"
                                  title="Expandir Detalhes"
                                >
                                  Ver Detalhes
                                </button>
                                {p.productionType === 'bed' && (
                                  <button
                                    type="button"
                                    onClick={() => handleRevertTransplant(p)}
                                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-xl text-xs transition-colors flex items-center gap-1"
                                    title="Desfazer transplante e voltar para mudas"
                                  >
                                    <ArrowLeft size={10} />
                                    Desfazer
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {processedItems.map((item) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={item.id}
              className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3 md:gap-4 mb-4">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shrink-0">
                  <Package size={20} className="md:w-6 md:h-6" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-slate-900 text-sm md:text-base truncate">{item.name}</h4>
                  <span className="text-[10px] md:text-xs text-slate-400">Processado / Combo</span>
                </div>
              </div>
              
              <div className="space-y-2 md:space-y-3">
                <div className="flex items-center justify-between text-xs md:text-sm">
                  <span className="text-slate-500">Quantidade em Estoque:</span>
                  <span className="font-bold text-slate-900">{item.quantity} {item.unit}</span>
                </div>
                {profile?.role === 'owner' && (
                  <>
                    <div className="flex items-center justify-between text-xs md:text-sm">
                      <span className="text-slate-500">Custo Unitário:</span>
                      <span className="font-bold text-rose-600">R$ {item.costPrice?.toFixed(2) || '0.00'}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs md:text-sm">
                      <span className="text-slate-500 font-bold">Valor Total em Estoque:</span>
                      <span className="font-bold text-slate-900">R$ {(item.quantity * (item.costPrice || 0)).toFixed(2)}</span>
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between text-xs md:text-sm">
                  <span className="text-slate-500">Preço de Venda:</span>
                  <span className="font-bold text-emerald-600">R$ {item.price?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="pt-2 md:pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] md:text-xs">
                  <span className="text-slate-400">Última atualização:</span>
                  <span className="text-slate-500 font-medium">
                    {item.lastUpdated?.toDate ? format(item.lastUpdated.toDate(), "dd/MM/yyyy") : 'N/A'}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
          {processedItems.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-400 italic bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
              Nenhum item processado ou combo encontrado.
            </div>
          )}
        </div>
      )}

      {/* Quick Input Modal */}
      <AnimatePresence>
        {isQuickInputModalOpen && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setQuickInputModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-bold text-slate-900">Cadastrar Novo Insumo</h3>
                  <button onClick={() => setQuickInputModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                    <XCircle size={24} />
                  </button>
                </div>

                <form onSubmit={handleQuickInputSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 ml-1">Nome do Insumo</label>
                    <input 
                      name="name" 
                      required 
                      placeholder="Ex: Semente de Alface"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Categoria</label>
                      <select 
                        name="category" 
                        required 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="seed">Sementes</option>
                        <option value="fertilizer">Fertilizantes</option>
                        <option value="other">Outros</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Unidade</label>
                      <input 
                        name="unit" 
                        required 
                        placeholder="Ex: un, kg, g"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Qtd em Estoque</label>
                      <input 
                        name="quantity" 
                        type="number" 
                        step="0.01"
                        required 
                        placeholder="0.00"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Custo Unitário (R$)</label>
                      <input 
                        name="costPrice" 
                        type="number" 
                        step="0.01"
                        required 
                        placeholder="0.00"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button 
                      type="button" 
                      onClick={() => setQuickInputModalOpen(false)}
                      className="flex-1 px-6 py-4 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                    >
                      Cadastrar e Usar
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Production Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-bold text-slate-900">
                    {selectedProduction ? 'Editar Produção' : 'Novo Plantio'}
                  </h3>
                  <button onClick={() => { setModalOpen(false); setSelectedProduction(null); }} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                    <XCircle size={24} />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {!selectedProduction && (
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Tipo de Produção</label>
                      <div className="flex gap-2">
                        <label className={cn(
                          "flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer",
                          "hover:bg-slate-50 text-sm font-bold",
                          "border-slate-100",
                          formProductionType === 'seedling' && "bg-emerald-50 border-emerald-500 text-emerald-700"
                        )}>
                          <input 
                            type="radio" 
                            name="productionType" 
                            value="seedling" 
                            className="hidden" 
                            checked={formProductionType === 'seedling'}
                            onChange={() => setFormProductionType('seedling')} 
                          />
                          <Sprout size={16} />
                          Produção de Mudas
                        </label>
                        <label className={cn(
                          "flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer",
                          "hover:bg-slate-50 text-sm font-bold",
                          "border-slate-100",
                          formProductionType === 'bed' && "bg-emerald-50 border-emerald-500 text-emerald-700"
                        )}>
                          <input 
                            type="radio" 
                            name="productionType" 
                            value="bed" 
                            className="hidden" 
                            checked={formProductionType === 'bed'}
                            onChange={() => setFormProductionType('bed')} 
                          />
                          <MapPin size={16} />
                          Canteiros
                        </label>
                      </div>
                    </div>
                  )}

                  {formProductionType === 'bed' && !selectedProduction && (
                    <div className="space-y-4 px-1">
                      <label className="text-sm font-bold text-slate-700 ml-1 block">Origem do Plantio</label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { id: 'seeds', label: 'Sementes / Direto', icon: Package },
                          { id: 'internal_seedlings', label: 'Mudas Próprias', icon: Sprout },
                          { id: 'purchased_seedlings', label: 'Mudas Compradas', icon: ShoppingBag },
                        ].map((option) => (
                           <label key={option.id} className={cn(
                            "flex-1 min-w-[120px] flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer",
                            "hover:bg-slate-50 text-xs font-bold",
                            "border-slate-100",
                            formPlantingSource === option.id && "bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm"
                          )}>
                            <input 
                              type="radio" 
                              name="plantingSource" 
                              value={option.id} 
                              className="hidden" 
                              checked={formPlantingSource === option.id}
                              onChange={() => setFormPlantingSource(option.id as any)} 
                            />
                            <option.icon size={14} />
                            {option.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Cultura (O que está plantando?)</label>
                      <input 
                        name="crop" 
                        required 
                        defaultValue={selectedProduction?.crop || ''}
                        placeholder="Ex: Alface Americana"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Local (Canteiro / Viveiro)</label>
                      <input 
                        name="bed" 
                        required 
                        placeholder={formProductionType === 'bed' ? 'Ex: Canteiro 01, Setor A' : 'Ex: Estufa, Viveiro A'}
                        defaultValue={selectedProduction?.bed || (formProductionType === 'seedling' ? 'Estufa' : '')}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Data de Plantio</label>
                      <input 
                        name="plantingDate" 
                        type="date"
                        required 
                        defaultValue={selectedProduction?.plantingDate 
                          ? (selectedProduction.plantingDate.toDate ? format(selectedProduction.plantingDate.toDate(), 'yyyy-MM-dd') : format(new Date(selectedProduction.plantingDate), 'yyyy-MM-dd'))
                          : new Date().toISOString().split('T')[0]
                        }
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    {formProductionType === 'seedling' && (
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 ml-1">Previsão de Transplante</label>
                        <input 
                          name="transplantDate" 
                          type="date"
                          defaultValue={selectedProduction?.transplantDate 
                            ? (selectedProduction.transplantDate.toDate ? format(selectedProduction.transplantDate.toDate(), 'yyyy-MM-dd') : format(new Date(selectedProduction.transplantDate), 'yyyy-MM-dd'))
                            : ''
                          }
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Previsão de Colheita</label>
                      <input 
                        name="estimatedHarvestDate" 
                        type="date"
                        defaultValue={selectedProduction?.estimatedHarvestDate 
                          ? (selectedProduction.estimatedHarvestDate.toDate ? format(selectedProduction.estimatedHarvestDate.toDate(), 'yyyy-MM-dd') : format(new Date(selectedProduction.estimatedHarvestDate), 'yyyy-MM-dd'))
                          : ''
                        }
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Quantidade</label>
                      <input 
                        name="quantityPlanted" 
                        type="number"
                        required 
                        defaultValue={selectedProduction?.quantityPlanted || ''}
                        placeholder="0"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Unidade</label>
                      <input 
                        name="unit" 
                        required 
                        defaultValue={selectedProduction?.unit || ''}
                        placeholder="Ex: mudas, un, kg"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="space-y-2 flex items-center gap-3 pt-6">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          name="isContinuousHarvest" 
                          value="true"
                          defaultChecked={selectedProduction?.isContinuousHarvest}
                          className="sr-only peer" 
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                        <span className="ml-3 text-sm font-bold text-slate-700">Colheita Contínua?</span>
                      </label>
                      <p className="text-[10px] text-slate-400 font-medium">Crops like tomato/pepper.</p>
                    </div>
                  </div>

                  {!selectedProduction && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between ml-1">
                        <label className="text-sm font-bold text-slate-700">Insumos Utilizados (Baixa Automática e Custo)</label>
                        <button 
                          type="button"
                          onClick={() => setQuickInputModalOpen(true)}
                          className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100 transition-all flex items-center gap-1"
                        >
                          <Plus size={10} />
                          Cadastrar Insumo
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-32 overflow-y-auto p-2 border border-slate-100 rounded-xl">
                        {inventory.filter(item => item.type === 'input' || !item.type).map(item => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => togglePlantingInput(item)}
                            className={cn(
                              "flex flex-col p-2 rounded-xl border transition-all text-left",
                              selectedPlantingInputs.find(p => p.itemId === item.id)
                                ? "bg-emerald-50 border-emerald-200 ring-1 ring-emerald-200"
                                : "bg-slate-50 border-transparent hover:border-slate-200"
                            )}
                          >
                            <span className="text-xs font-bold text-slate-700 truncate">{item.name}</span>
                            <span className="text-[10px] text-slate-400">{item.quantity} {item.unit} disp.</span>
                          </button>
                        ))}
                      </div>

                      {selectedPlantingInputs.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Quantidades Iniciais</p>
                          <div className="space-y-2">
                            {selectedPlantingInputs.map(prod => (
                              <div key={prod.itemId} className="flex items-center justify-between gap-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <span className="text-sm font-medium text-slate-700">{prod.name}</span>
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="number"
                                    step="0.01"
                                    value={prod.quantity}
                                    onChange={(e) => updatePlantingInputQuantity(prod.itemId, Number(e.target.value))}
                                    className="w-20 px-2 py-1 bg-white border border-slate-200 rounded-lg text-right text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                  />
                                  <span className="text-xs text-slate-500 w-8">{prod.unit}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="pt-4 flex gap-3">
                    <button 
                      type="button" 
                      onClick={() => { setModalOpen(false); setSelectedProduction(null); }}
                      className="flex-1 px-6 py-4 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                    >
                      {selectedProduction ? 'Salvar Alterações' : 'Iniciar Produção'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Log Modal */}
      <AnimatePresence>
        {isLogModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLogModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-xl rounded-[2rem] shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-bold text-slate-900">
                    {editingLogIndex !== null ? 'Editar Manejo' : 'Registrar Manejo'}
                  </h3>
                  <button onClick={() => { setLogModalOpen(false); setSelectedLogProducts([]); setEditingLogIndex(null); }} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                    <XCircle size={24} />
                  </button>
                </div>

                <form onSubmit={handleAddLog} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Data do Manejo</label>
                      <input 
                        name="date" 
                        type="date"
                        required 
                        defaultValue={editingLogIndex !== null && selectedProduction?.logs[editingLogIndex] 
                          ? (selectedProduction.logs[editingLogIndex].date?.toDate 
                            ? format(selectedProduction.logs[editingLogIndex].date.toDate(), 'yyyy-MM-dd') 
                            : format(new Date(selectedProduction.logs[editingLogIndex].date), 'yyyy-MM-dd'))
                          : new Date().toISOString().split('T')[0]}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Descrição</label>
                      <input 
                        name="description" 
                        required 
                        placeholder="Ex: Adubação foliar"
                        defaultValue={editingLogIndex !== null && selectedProduction?.logs[editingLogIndex] ? selectedProduction.logs[editingLogIndex].description : ''}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between ml-1">
                      <label className="text-sm font-bold text-slate-700">Produtos Utilizados (Baixa Automática)</label>
                      <button 
                        type="button"
                        onClick={() => setQuickInputModalOpen(true)}
                        className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100 transition-all flex items-center gap-1"
                      >
                        <Plus size={10} />
                        Cadastrar Insumo
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-2 border border-slate-100 rounded-xl">
                      {inventory.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleLogProduct(item)}
                          className={cn(
                            "flex flex-col p-2 rounded-xl border transition-all text-left",
                            selectedLogProducts.find(p => p.itemId === item.id)
                              ? "bg-emerald-50 border-emerald-200 ring-1 ring-emerald-200"
                              : "bg-slate-50 border-transparent hover:border-slate-200"
                          )}
                        >
                          <span className="text-xs font-bold text-slate-700 truncate">{item.name}</span>
                          <span className="text-[10px] text-slate-400">{item.quantity} {item.unit} disp.</span>
                        </button>
                      ))}
                    </div>

                    {selectedLogProducts.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Quantidades Utilizadas</p>
                        <div className="space-y-2">
                          {selectedLogProducts.map(prod => (
                            <div key={prod.itemId} className="flex items-center justify-between gap-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                              <span className="text-sm font-medium text-slate-700">{prod.name}</span>
                              <div className="flex items-center gap-2">
                                <input 
                                  type="number"
                                  step="0.01"
                                  value={prod.quantity}
                                  onChange={(e) => updateLogProductQuantity(prod.itemId, Number(e.target.value))}
                                  className="w-20 px-2 py-1 bg-white border border-slate-200 rounded-lg text-right text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                                <span className="text-xs text-slate-500 w-8">{prod.unit}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button 
                      type="button" 
                      onClick={() => { setLogModalOpen(false); setSelectedLogProducts([]); }}
                      className="flex-1 px-6 py-4 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                    >
                      Salvar e Dar Baixa
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Process Modal */}
      <AnimatePresence>
        {isProcessModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setProcessModalOpen(false); setSelectedProcessInputs([]); }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-bold text-slate-900 text-amber-600">Processar / Criar Combo</h3>
                  <button onClick={() => { setProcessModalOpen(false); setSelectedProcessInputs([]); }} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                    <XCircle size={24} />
                  </button>
                </div>

                <form onSubmit={handleProcess} className="space-y-6">
                  {!selectedProduction && (
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Selecione a Produção Colhida</label>
                      <select 
                        required
                        onChange={(e) => {
                          const p = productions.find(prod => prod.id === e.target.value);
                          if (p) setSelectedProduction(p);
                        }}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="">Selecione uma colheita...</option>
                        {productions.filter(p => p.status === 'harvested' && (p.remainingQuantity ?? p.harvestQuantity ?? 0) > 0).map(p => (
                          <option key={p.id} value={p.id}>{p.crop} - {p.bed} ({(p.remainingQuantity ?? p.harvestQuantity ?? 0)} {p.unit} disp.)</option>
                        ))}
                      </select>
                      {productions.filter(p => p.status === 'harvested' && (p.remainingQuantity ?? p.harvestQuantity ?? 0) > 0).length === 0 && (
                        <p className="text-xs text-rose-500 font-bold mt-1 ml-1">Nenhuma colheita disponível para processamento.</p>
                      )}
                    </div>
                  )}

                  {selectedProduction && (
                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                      <p className="text-sm font-bold text-amber-700">Origem: {selectedProduction?.crop} ({(selectedProduction?.remainingQuantity ?? selectedProduction?.harvestQuantity ?? 0)} {selectedProduction?.unit} disponíveis)</p>
                      {!isProcessModalOpen && <button type="button" onClick={() => setSelectedProduction(null)} className="text-xs text-amber-600 underline mt-1">Trocar origem</button>}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Qtd. de Origem Utilizada ({selectedProduction?.unit})</label>
                      <input 
                        name="sourceQuantityUsed" 
                        type="number"
                        step="0.01"
                        required 
                        placeholder="Ex: 100"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Nome do Novo Produto</label>
                      <input 
                        name="newProductName" 
                        required 
                        placeholder="Ex: Bandeja de Milho (5 un)"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Qtd. Produzida</label>
                      <input 
                        name="newProductQuantity" 
                        type="number"
                        required 
                        placeholder="Ex: 20"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Unidade</label>
                      <input 
                        name="newProductUnit" 
                        required 
                        placeholder="Ex: bandeja"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Preço Sugerido (R$)</label>
                      <input 
                        name="newProductPrice" 
                        type="number"
                        step="0.01"
                        placeholder="0,00"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between ml-1">
                      <label className="text-sm font-bold text-slate-700">Embalagens / Insumos Utilizados</label>
                      <button 
                        type="button"
                        onClick={() => setQuickInputModalOpen(true)}
                        className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100 transition-all flex items-center gap-1"
                      >
                        <Plus size={10} />
                        Cadastrar Insumo
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-32 overflow-y-auto p-2 border border-slate-100 rounded-xl">
                      {inventory.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleProcessInput(item)}
                          className={cn(
                            "flex flex-col p-2 rounded-xl border transition-all text-left",
                            selectedProcessInputs.find(p => p.itemId === item.id)
                              ? "bg-amber-50 border-amber-200 ring-1 ring-amber-200"
                              : "bg-slate-50 border-transparent hover:border-slate-200"
                          )}
                        >
                          <span className="text-xs font-bold text-slate-700 truncate">{item.name}</span>
                          <span className="text-[10px] text-slate-400">{item.quantity} {item.unit} disp.</span>
                        </button>
                      ))}
                    </div>

                    {selectedProcessInputs.length > 0 && (
                      <div className="space-y-2">
                        <div className="space-y-2">
                          {selectedProcessInputs.map(prod => (
                            <div key={prod.itemId} className="flex items-center justify-between gap-4 bg-slate-50 p-2 rounded-xl border border-slate-100">
                              <span className="text-xs font-medium text-slate-700">{prod.name}</span>
                              <div className="flex items-center gap-2">
                                <input 
                                  type="number"
                                  step="0.01"
                                  value={prod.quantity}
                                  onChange={(e) => updateProcessInputQuantity(prod.itemId, Number(e.target.value))}
                                  className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-right text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                                <span className="text-[10px] text-slate-500 w-8">{prod.unit}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button 
                      type="button" 
                      onClick={() => { setProcessModalOpen(false); setSelectedProcessInputs([]); }}
                      className="flex-1 px-6 py-4 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 px-6 py-4 bg-amber-600 text-white rounded-2xl font-bold hover:bg-amber-700 transition-all shadow-lg shadow-amber-100"
                    >
                      Finalizar Processamento
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Harvest Modal */}
      <AnimatePresence>
        {isHarvestModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHarvestModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-bold text-slate-900 text-blue-600">Registrar Colheita</h3>
                  <button onClick={() => setHarvestModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                    <XCircle size={24} />
                  </button>
                </div>

                <form onSubmit={handleHarvest} className="space-y-6">
                  <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                    <p className="text-sm font-bold text-blue-700">Cultura: {selectedProduction?.crop}</p>
                    <p className="text-xs text-blue-600">Local: {selectedProduction?.bed}</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 ml-1">Data da Colheita</label>
                    <input 
                      name="harvestDate" 
                      type="date"
                      required 
                      defaultValue={new Date().toISOString().split('T')[0]}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 ml-1">Quantidade Colhida ({selectedProduction?.unit})</label>
                    <input 
                      name="harvestQuantity" 
                      type="number"
                      step="0.01"
                      required 
                      placeholder="0.00"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button 
                      type="button" 
                      onClick={() => setHarvestModalOpen(false)}
                      className="flex-1 px-6 py-4 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                    >
                      Confirmar Colheita
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transplant Seedling Modal */}
      <AnimatePresence>
        {isTransplantModalOpen && selectedProduction && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setTransplantModalOpen(false); setSelectedProduction(null); setTransplantError(null); }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-bold text-slate-900 text-emerald-600">Transplantar ao Campo</h3>
                  <button onClick={() => { setTransplantModalOpen(false); setSelectedProduction(null); setTransplantError(null); }} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                    <XCircle size={24} />
                  </button>
                </div>

                <form onSubmit={handleTransplantSubmit} className="space-y-6">
                  {transplantError && (
                    <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-bold">
                      {transplantError}
                    </div>
                  )}

                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <p className="text-sm font-bold text-emerald-800">Cultura: {selectedProduction.crop}</p>
                    <p className="text-xs text-emerald-600">Origem: {selectedProduction.bed} ({selectedProduction.quantityPlanted} {selectedProduction.unit} semeadas)</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 ml-1">Data de Transplante</label>
                    <input 
                      name="transplantDate" 
                      type="date"
                      required 
                      defaultValue={new Date().toISOString().split('T')[0]}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 ml-1">Canteiro de Destino (Campo)</label>
                    <input 
                      name="destinationBed" 
                      required 
                      placeholder="Ex: Canteiro 04, Setor B"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      list="existing-beds-list"
                    />
                    <datalist id="existing-beds-list">
                      {bedSuggestions.map(bedName => (
                        <option key={bedName} value={bedName} />
                      ))}
                    </datalist>
                    {bedSuggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className="text-[10px] text-slate-400 font-bold uppercase self-center mr-1">Sugestões:</span>
                        {bedSuggestions.slice(0, 4).map(bedName => (
                          <button
                            key={bedName}
                            type="button"
                            onClick={(e) => {
                              const form = e.currentTarget.closest('form');
                              const input = form?.elements.namedItem('destinationBed') as HTMLInputElement;
                              if (input) input.value = bedName;
                            }}
                            className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-2 py-1 rounded-lg transition-colors border border-slate-200"
                          >
                            {bedName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1 flex items-center justify-between">
                        <span>Qtd. Real de Mudas</span>
                        <span className="text-[10px] text-slate-400 font-medium">(Nem todas vingaram)</span>
                      </label>
                      <input 
                        name="quantityTransplanted" 
                        type="number"
                        required 
                        defaultValue={selectedProduction.quantityPlanted}
                        placeholder="0"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Previsão de Colheita</label>
                      <input 
                        name="estimatedHarvestDate" 
                        type="date"
                        defaultValue={selectedProduction.estimatedHarvestDate 
                          ? (selectedProduction.estimatedHarvestDate.toDate ? format(selectedProduction.estimatedHarvestDate.toDate(), 'yyyy-MM-dd') : format(new Date(selectedProduction.estimatedHarvestDate), 'yyyy-MM-dd'))
                          : ''
                        }
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      />
                    </div>
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button 
                      type="button" 
                      onClick={() => { setTransplantModalOpen(false); setSelectedProduction(null); setTransplantError(null); }}
                      className="flex-1 px-6 py-4 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                    >
                      Confirmar Transplante
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Visão Focada */}
      <AnimatePresence>
        {focusedProduction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-slate-900/95 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-5xl h-full md:h-[90vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="p-8 border-b border-slate-100 flex items-start justify-between bg-gradient-to-br from-white to-slate-50">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-3xl bg-emerald-600 text-white flex items-center justify-center shadow-xl shadow-emerald-200">
                      <Sprout size={32} />
                    </div>
                    <div>
                      <h3 className="text-3xl font-black text-slate-900 tracking-tight">{focusedProduction.crop}</h3>
                      <div className="flex items-center gap-3 text-slate-500 font-bold">
                        <span className="flex items-center gap-1.5">
                          <MapPin size={16} /> {focusedProduction.bed}
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                        <span className="flex items-center gap-1.5">
                          <Calendar size={16} /> {focusedProduction.plantingDate?.toDate ? format(focusedProduction.plantingDate.toDate(), "dd/MM/yyyy") : format(new Date(focusedProduction.plantingDate), "dd/MM/yyyy")}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    <button 
                      onClick={() => handleEditProduction(focusedProduction)}
                      className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-100 shadow-sm flex items-center gap-2 hover:bg-emerald-100 transition-all font-bold text-xs"
                    >
                      <Edit2 size={14} />
                      Editar Dados
                    </button>
                    {focusedProduction.status === 'growing' && focusedProduction.productionType === 'seedling' && (
                      <button 
                        onClick={() => { setSelectedProduction(focusedProduction); setTransplantModalOpen(true); }}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-2xl border border-emerald-500 shadow-sm shadow-emerald-100 flex items-center gap-2 hover:bg-emerald-700 transition-all font-bold text-xs"
                      >
                        <ArrowRight size={14} />
                        Transplantar Mudas
                      </button>
                    )}
                    {focusedProduction.status === 'growing' && focusedProduction.productionType === 'bed' && (focusedProduction.plantingSource === 'internal_seedlings' || focusedProduction.transplantDate || focusedProduction.logs?.some(l => l.description && (l.description.toLowerCase().includes('transplant') || l.description.toLowerCase().includes('muda')))) && (
                      <button 
                        onClick={() => handleRevertTransplant(focusedProduction)}
                        className="px-4 py-2 bg-orange-50 text-orange-700 rounded-2xl border border-orange-100 shadow-sm flex items-center gap-2 hover:bg-orange-100 transition-all font-bold text-xs"
                      >
                        <ArrowLeft size={14} />
                        Desfazer Transplante
                      </button>
                    )}
                    <button 
                      onClick={() => { handleDelete(focusedProduction.id); setFocusedProduction(null); }}
                      className="px-4 py-2 bg-rose-50 text-rose-700 rounded-2xl border border-rose-100 shadow-sm flex items-center gap-2 hover:bg-rose-100 transition-all font-bold text-xs"
                    >
                      <Trash2 size={14} />
                      Excluir Registro
                    </button>
                    <div className="px-4 py-2 bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center gap-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status:</span>
                      <span className={cn(
                        "text-xs font-black uppercase",
                        focusedProduction.status === 'growing' ? "text-emerald-600" :
                        focusedProduction.status === 'harvested' ? "text-blue-600" : "text-rose-600"
                      )}>{focusedProduction.status}</span>
                    </div>
                    <div className="px-4 py-2 bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center gap-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Quantidade:</span>
                      <span className="text-xs font-black text-slate-700">{focusedProduction.quantityPlanted} {focusedProduction.unit}</span>
                    </div>
                    <div className="px-4 py-2 bg-slate-900 text-white rounded-2xl shadow-lg shadow-slate-200 flex items-center gap-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Custo Total:</span>
                      <span className="text-xs font-black">R$ {focusedProduction.totalCost.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setFocusedProduction(null)}
                  className="p-3 text-slate-400 hover:bg-slate-100 rounded-3xl transition-all"
                >
                  <XCircle size={32} />
                </button>
              </div>

              {/* Main Content Areas */}
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {/* Timeline Area */}
                <div className="flex-1 p-8 overflow-y-auto custom-scrollbar flex flex-col bg-white">
                  <div className="flex items-center justify-between mb-8">
                    <h4 className="text-xl font-black text-slate-900 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                        <Zap size={16} fill="currentColor" />
                      </div>
                      Histórico de Manejo
                    </h4>
                    <button 
                      onClick={() => { setSelectedProduction(focusedProduction); setLogModalOpen(true); }}
                      className="px-6 py-3 bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 flex items-center gap-2"
                    >
                      <PlusCircle size={16} />
                      Novo Manejo
                    </button>
                  </div>

                  <div className="space-y-10 relative pl-8 before:absolute before:left-12 before:top-4 before:bottom-0 before:w-[2px] before:bg-slate-100">
                    {focusedProduction.logs.length === 0 ? (
                      <div className="text-center py-20 bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200">
                        <ClipboardList size={48} className="mx-auto text-slate-300 mb-4" />
                        <p className="text-slate-500 font-bold">Nenhum manejo registrado ainda.</p>
                      </div>
                    ) : (
                      focusedProduction.logs.slice().reverse().map((log, idx) => {
                        const originalIndex = focusedProduction.logs.length - 1 - idx;
                        return (
                          <div key={idx} className="relative group/focuslog">
                            {/* Marker */}
                            <div className="absolute -left-8 top-1 w-8 h-8 rounded-2xl bg-white border-4 border-slate-50 shadow-sm flex items-center justify-center z-10">
                              <div className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                            </div>
                            
                            <div className="bg-slate-50 hover:bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:border-emerald-100 transition-all duration-300">
                              <div className="flex items-start justify-between mb-4">
                                <div>
                                  <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">
                                    {log.date?.toDate ? format(log.date.toDate(), "dd 'de' MMMM", { locale: ptBR }) : format(new Date(log.date), "dd 'de' MMMM", { locale: ptBR })}
                                  </p>
                                  <h5 className="text-xl font-bold text-slate-900">{log.description}</h5>
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover/focuslog:opacity-100 transition-all">
                                  <button 
                                    onClick={() => handleEditLog(focusedProduction, originalIndex)}
                                    className="p-3 bg-white text-slate-400 hover:text-emerald-600 rounded-2xl shadow-sm border border-slate-100"
                                    title="Editar"
                                  >
                                    <Edit2 size={18} />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteLog(focusedProduction, originalIndex)}
                                    className="p-3 bg-white text-slate-400 hover:text-rose-600 rounded-2xl shadow-sm border border-slate-100"
                                    title="Excluir"
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </div>
                              </div>

                              {log.products && log.products.length > 0 && (
                                <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-100">
                                  {log.products.map((prod, j) => (
                                    <div key={j} className="px-4 py-2 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-600 flex items-center gap-2">
                                      <Package size={14} className="text-slate-400" />
                                      {prod.name}: {prod.quantity} {prod.unit}
                                      <span className="text-[10px] text-slate-400 font-black">R$ {(prod.costAtTime * prod.quantity).toFixed(2)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Sidebar Info Area */}
                <div className="w-full md:w-80 bg-slate-50 p-8 border-l border-slate-100 space-y-8 h-full overflow-y-auto text-slate-900">
                   <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Métricas do Lote</p>
                      <div className="space-y-4">
                        <div className="p-5 bg-white rounded-3xl shadow-sm border border-slate-100">
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Idade Atual</p>
                          <p className="text-2xl font-black text-slate-800">{getDaysSincePlanting(focusedProduction.plantingDate)} dias</p>
                        </div>
                        <div className="p-5 bg-white rounded-3xl shadow-sm border border-slate-100">
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Custo por Unidade</p>
                          <p className="text-2xl font-black text-slate-800">R$ {(focusedProduction.totalCost / focusedProduction.quantityPlanted).toFixed(2)}</p>
                        </div>
                      </div>
                   </div>

                   <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Datas Chave</p>
                      <div className="space-y-3">
                         <div className="flex items-center justify-between text-xs font-bold">
                            <span className="text-slate-500">Plantio:</span>
                            <span className="text-slate-900">{focusedProduction.plantingDate?.toDate ? format(focusedProduction.plantingDate.toDate(), "dd/MM/yy") : format(new Date(focusedProduction.plantingDate), "dd/MM/yy")}</span>
                         </div>
                         {focusedProduction.transplantDate && (
                           <div className="flex items-center justify-between text-xs font-bold">
                              <span className="text-slate-500">Transplante:</span>
                              <span className="text-emerald-600 uppercase font-black">{focusedProduction.transplantDate?.toDate ? format(focusedProduction.transplantDate.toDate(), "dd/MM/yy") : format(new Date(focusedProduction.transplantDate), "dd/MM/yy")}</span>
                           </div>
                         )}
                         {focusedProduction.estimatedHarvestDate && (
                           <div className="flex items-center justify-between text-xs font-bold">
                              <span className="text-slate-500">Colheita Est.:</span>
                              <span className="text-blue-600 uppercase font-black">{focusedProduction.estimatedHarvestDate?.toDate ? format(focusedProduction.estimatedHarvestDate.toDate(), "dd/MM/yy") : format(new Date(focusedProduction.estimatedHarvestDate), "dd/MM/yy")}</span>
                           </div>
                         )}
                      </div>
                   </div>

                   <div className="pt-8 opacity-50">
                      <p className="text-center italic text-[10px] font-bold text-slate-400 uppercase group-hover:opacity-100">HortoManager Focus Mode v2.0</p>
                   </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function getDaysSincePlanting(date: any) {
  if (!date) return 0;
  const planting = date.toDate ? date.toDate() : new Date(date);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - planting.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
