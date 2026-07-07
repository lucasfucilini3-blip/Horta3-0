import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc, 
  serverTimestamp, 
  increment, 
  Timestamp,
  getDocs,
  where,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase';
import { Production, InventoryItem, ProduceCatalogItem } from '../types';
import { 
  Sprout, 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  Calendar, 
  TrendingUp, 
  ClipboardList, 
  FileSpreadsheet, 
  Download, 
  AlertTriangle, 
  Layers, 
  PlusCircle, 
  RotateCcw, 
  CheckSquare, 
  ChevronRight, 
  Filter, 
  ChevronDown, 
  Info,
  DollarSign
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth, handleFirestoreError, OperationType } from '../App';

const STANDARD_CROPS = [
  'Alface Crespa', 
  'Alface Americana', 
  'Alface Lisa', 
  'Rúcula', 
  'Cebolinha', 
  'Salsa', 
  'Coentro', 
  'Couve Manteiga', 
  'Agrião', 
  'Espinafre', 
  'Rabanete', 
  'Brócolis', 
  'Repolho', 
  'Couve-Flor', 
  'Chicória',
  'Tomate',
  'Pimentão'
];

const STANDARD_UNITS = ['un', 'mç', 'kg', 'g', 'bandeja'];

export default function ProductionComponent() {
  const { profile } = useAuth();
  
  // Tab control: 'spreadsheet' (Mapa de Canteiros), 'history' (Todos os Lançamentos) ou 'catalog' (Catálogo de Cultivos)
  const [activeTab, setActiveTab] = useState<'spreadsheet' | 'history' | 'catalog'>('spreadsheet');

  // Core data states
  const [productions, setProductions] = useState<Production[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [produceCatalog, setProduceCatalog] = useState<ProduceCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Catalog item creation and edit states
  const [isAddingCatalogItem, setIsAddingCatalogItem] = useState(false);
  const [catalogName, setCatalogName] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('Hortaliças');
  const [catalogUnit, setCatalogUnit] = useState('un');
  const [catalogDays, setCatalogDays] = useState('45');
  const [catalogPrice, setCatalogPrice] = useState('5.00');
  const [editingCatalogItemId, setEditingCatalogItemId] = useState<string | null>(null);

  // Custom confirmation modal state
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    actionLabel: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  const confirmAction = (
    title: string,
    message: string,
    actionLabel: string,
    onConfirm: () => void | Promise<void>
  ) => {
    setConfirmationModal({
      isOpen: true,
      title,
      message,
      actionLabel,
      onConfirm: async () => {
        try {
          await onConfirm();
        } catch (error) {
          console.error("Erro na ação confirmada:", error);
        } finally {
          setConfirmationModal(null);
        }
      }
    });
  };

  // Search and quick filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'growing' | 'harvested' | 'lost'>('all');

  // Spreadsheet bed management
  const [customBeds, setCustomBeds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('horta_custom_beds');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [newBedName, setNewBedName] = useState('');
  const [isAddingBed, setIsAddingBed] = useState(false);

  // Default set of beds
  const defaultBeds = useMemo(() => [
    'Canteiro 01', 'Canteiro 02', 'Canteiro 03', 'Canteiro 04', 'Canteiro 05',
    'Canteiro 06', 'Canteiro 07', 'Canteiro 08', 'Canteiro 09', 'Canteiro 10',
    'Canteiro 11', 'Canteiro 12'
  ], []);

  // Merge default beds, custom beds, and any other bed IDs found in existing production database records
  const allBedsList = useMemo(() => {
    const dbBeds = productions.map(p => p.bed).filter(Boolean);
    const unique = Array.from(new Set([...defaultBeds, ...customBeds, ...dbBeds]));
    return unique.sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10);
      const numB = parseInt(b.replace(/\D/g, ''), 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  }, [productions, defaultBeds, customBeds]);

  // Selected row state for the Excel formula bar simulation
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  // Inline editing row states
  // `editingBedName` tells which bed row is in edit mode.
  // If editing an existing planting, `editingProductionId` is set.
  // If planting on an empty bed, `editingProductionId` is null.
  const [editingBedName, setEditingBedName] = useState<string | null>(null);
  const [editingProductionId, setEditingProductionId] = useState<string | null>(null);

  // Inline edit field states
  const [editCrop, setEditCrop] = useState('');
  const [editDate, setEditDate] = useState(new Date().toISOString().split('T')[0]);
  const [editQuantity, setEditQuantity] = useState(50);
  const [editUnit, setEditUnit] = useState('un');
  const [showCropSuggestions, setShowCropSuggestions] = useState(false);

  // Harvest modal state
  const [harvestingItem, setHarvestingItem] = useState<Production | null>(null);
  const [harvestQty, setHarvestQty] = useState('');
  const [harvestPackages, setHarvestPackages] = useState('');
  const [harvestDate, setHarvestDate] = useState(new Date().toISOString().split('T')[0]);
  const [harvestType, setHarvestType] = useState<'partial' | 'final'>('partial');
  const [addToInventory, setAddToInventory] = useState(true);

  // States for matching or registering inventory products
  const [harvestProductMode, setHarvestProductMode] = useState<'existing' | 'new'>('existing');
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState<string>('');
  const [selectedCatalogItemId, setSelectedCatalogItemId] = useState<string>('');
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('5.00');
  const [newProductCostPrice, setNewProductCostPrice] = useState('0.00');
  const [newProductUnit, setNewProductUnit] = useState('un');
  const [newProductMinStock, setNewProductMinStock] = useState('10');
  const [newProductCategory, setNewProductCategory] = useState('Hortaliças');

  // Collective Planting Modal States
  const [isCollectivePlantingOpen, setIsCollectivePlantingOpen] = useState(false);
  const [collectivePlantingDate, setCollectivePlantingDate] = useState(new Date().toISOString().split('T')[0]);
  const [collectiveRows, setCollectiveRows] = useState<Array<{ bed: string; crop: string; quantity: string; unit: string }>>([
    { bed: '', crop: '', quantity: '', unit: 'un' }
  ]);

  const dispatchCategories = useMemo(() => {
    const categories = inventory
      .filter(item => item.type === 'dispatch' && item.category)
      .map(item => item.category);
    return Array.from(new Set(['Hortaliças', 'Legumes', 'Temperos', ...categories]));
  }, [inventory]);

  // Load production database records & inventory from Firestore
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'production'), orderBy('plantingDate', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Production));
      setProductions(fetched);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'production');
    });

    const invQ = query(collection(db, 'inventory'), orderBy('name', 'asc'));
    const unsubscribeInv = onSnapshot(invQ, (snapshot) => {
      const fetchedInv = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
      setInventory(fetchedInv);
    });

    const catQ = collection(db, 'produce_catalog');
    const unsubscribeCat = onSnapshot(catQ, (snapshot) => {
      const fetchedCat = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProduceCatalogItem));
      fetchedCat.sort((a, b) => a.name.localeCompare(b.name));
      setProduceCatalog(fetchedCat);
    }, (error) => {
      console.error("Erro ao carregar catálogo:", error);
    });

    return () => {
      unsubscribe();
      unsubscribeInv();
      unsubscribeCat();
    };
  }, []);

  // Save custom beds to localStorage
  const saveCustomBeds = (beds: string[]) => {
    setCustomBeds(beds);
    localStorage.setItem('horta_custom_beds', JSON.stringify(beds));
  };

  // Add custom bed row
  const handleAddBed = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBedName.trim()) return;
    const trimmed = newBedName.trim();
    if (allBedsList.includes(trimmed)) {
      alert('Este canteiro já existe na planilha!');
      return;
    }
    const updated = [...customBeds, trimmed];
    saveCustomBeds(updated);
    setNewBedName('');
    setIsAddingBed(false);
  };

  // Remove custom bed row (only if it has no active crops)
  const handleRemoveBed = (bedName: string) => {
    const hasCrops = productions.some(p => p.bed === bedName && p.status === 'growing');
    if (hasCrops) {
      alert('Não é possível remover este canteiro pois ele possui cultivos ativos.');
      return;
    }
    
    confirmAction(
      'Remover Canteiro',
      `Deseja mesmo remover a linha do "${bedName}" da planilha?`,
      'Remover',
      () => {
        const updated = customBeds.filter(b => b !== bedName);
        saveCustomBeds(updated);
        if (editingBedName === bedName) {
          cancelEditing();
        }
      }
    );
  };

  // Catalog actions
  const handleAddOrUpdateCatalogItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catalogName.trim()) {
      alert('Por favor, insira o nome do produto/cultura!');
      return;
    }

    try {
      setLoading(true);
      const payload = {
        name: catalogName.trim(),
        category: catalogCategory,
        unit: catalogUnit,
        estimatedDaysToHarvest: Number(catalogDays) || 45,
        defaultPrice: Number(catalogPrice) || 0,
        createdAt: serverTimestamp()
      };

      if (editingCatalogItemId) {
        await updateDoc(doc(db, 'produce_catalog', editingCatalogItemId), {
          ...payload
        });
        alert('Produto do catálogo atualizado com sucesso!');
      } else {
        await addDoc(collection(db, 'produce_catalog'), payload);
        alert('Produto cadastrado no catálogo com sucesso!');
      }

      // Reset form
      setCatalogName('');
      setCatalogCategory('Hortaliças');
      setCatalogUnit('un');
      setCatalogDays('45');
      setCatalogPrice('5.00');
      setEditingCatalogItemId(null);
      setIsAddingCatalogItem(false);
    } catch (error) {
      console.error("Erro ao salvar no catálogo:", error);
      handleFirestoreError(error, OperationType.WRITE, 'produce_catalog');
    } finally {
      setLoading(false);
    }
  };

  const startEditCatalogItem = (item: ProduceCatalogItem) => {
    setEditingCatalogItemId(item.id);
    setCatalogName(item.name);
    setCatalogCategory(item.category || 'Hortaliças');
    setCatalogUnit(item.unit || 'un');
    setCatalogDays(String(item.estimatedDaysToHarvest || 45));
    setCatalogPrice(String(item.defaultPrice || 5.00));
    setIsAddingCatalogItem(true);
  };

  const handleDeleteCatalogItem = async (id: string) => {
    confirmAction(
      'Excluir Produto do Catálogo',
      'Deseja mesmo excluir este produto do catálogo? Os cultivos já registrados que herdam este produto continuarão salvos.',
      'Excluir',
      async () => {
        try {
          setLoading(true);
          await deleteDoc(doc(db, 'produce_catalog', id));
          alert('Produto removido com sucesso!');
        } catch (error) {
          console.error("Erro ao deletar do catálogo:", error);
          handleFirestoreError(error, OperationType.DELETE, 'produce_catalog');
        } finally {
          setLoading(false);
        }
      }
    );
  };

  const handleImportStandardCrops = async () => {
    try {
      setLoading(true);
      let count = 0;
      for (const crop of STANDARD_CROPS) {
        const exists = produceCatalog.some(item => item.name.toLowerCase() === crop.toLowerCase());
        if (!exists) {
          const payload = {
            name: crop,
            category: 'Hortaliças',
            unit: 'un',
            estimatedDaysToHarvest: 45,
            defaultPrice: 5.00,
            createdAt: serverTimestamp()
          };
          await addDoc(collection(db, 'produce_catalog'), payload);
          count++;
        }
      }
      alert(`${count} cultivos padrão foram importados para o catálogo com sucesso!`);
    } catch (error) {
      console.error("Erro ao importar cultivos padrão:", error);
      handleFirestoreError(error, OperationType.WRITE, 'produce_catalog');
    } finally {
      setLoading(false);
    }
  };

  const handleImportFromInventory = async () => {
    try {
      setLoading(true);
      let count = 0;
      const dispatchItems = inventory.filter(item => item.type === 'dispatch' || item.category === 'Hortaliças');
      for (const invItem of dispatchItems) {
        const exists = produceCatalog.some(item => item.name.toLowerCase() === invItem.name.toLowerCase());
        if (!exists) {
          const payload = {
            name: invItem.name,
            category: invItem.category || 'Hortaliças',
            unit: invItem.unit || 'un',
            estimatedDaysToHarvest: 45,
            defaultPrice: invItem.price || 5.00,
            createdAt: serverTimestamp()
          };
          await addDoc(collection(db, 'produce_catalog'), payload);
          count++;
        }
      }
      alert(`${count} produtos do estoque de expedição foram importados para o catálogo com sucesso!`);
    } catch (error) {
      console.error("Erro ao importar do estoque:", error);
      handleFirestoreError(error, OperationType.WRITE, 'produce_catalog');
    } finally {
      setLoading(false);
    }
  };

  // Convert Firebase Timestamp or any date to native JS date or string
  const formatDate = (dateValue: any) => {
    if (!dateValue) return '-';
    let d: Date;
    if (dateValue.toDate) {
      d = dateValue.toDate();
    } else {
      d = new Date(dateValue);
    }
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('pt-BR');
  };

  // Calculate days in field
  const getDaysInField = (dateValue: any) => {
    if (!dateValue) return 0;
    let d: Date;
    if (dateValue.toDate) {
      d = dateValue.toDate();
    } else {
      d = new Date(dateValue);
    }
    if (isNaN(d.getTime())) return 0;
    const diff = new Date().getTime() - d.getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  };

  // Enter edit mode for a canteiro
  // `prod` is passed if we are editing an existing planting record.
  // `prod` is null if we are registering a brand-new planting on an empty canteiro.
  const startEditing = (bedName: string, prod: Production | null = null) => {
    setEditingBedName(bedName);
    if (prod) {
      setEditingProductionId(prod.id);
      setEditCrop(prod.crop);
      setEditQuantity(prod.quantityPlanted);
      setEditUnit(prod.unit || 'un');
      
      let pDate = '';
      if (prod.plantingDate) {
        const d = prod.plantingDate.toDate ? prod.plantingDate.toDate() : new Date(prod.plantingDate);
        pDate = d.toISOString().split('T')[0];
      } else {
        pDate = new Date().toISOString().split('T')[0];
      }
      setEditDate(pDate);
    } else {
      setEditingProductionId(null);
      setEditCrop('');
      setEditQuantity(50);
      setEditUnit('un');
      setEditDate(new Date().toISOString().split('T')[0]);
    }
  };

  const cancelEditing = () => {
    setEditingBedName(null);
    setEditingProductionId(null);
    setEditCrop('');
  };

  const handleSaveCollectivePlanting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    // Validate
    for (const row of collectiveRows) {
      if (!row.bed.trim()) {
        alert('Por favor, informe o canteiro em todas as linhas!');
        return;
      }
      if (!row.crop.trim()) {
        alert('Por favor, informe a cultura/verdura em todas as linhas!');
        return;
      }
      const qty = Number(row.quantity);
      if (isNaN(qty) || qty <= 0) {
        alert('A quantidade plantada deve ser maior que zero!');
        return;
      }
    }

    try {
      setLoading(true);
      const plantingDateVal = new Date(collectivePlantingDate + 'T12:00:00');
      const recordTimestamp = Timestamp.fromDate(plantingDateVal);

      for (const row of collectiveRows) {
        const qty = Number(row.quantity);
        const newPlanting = {
          crop: row.crop.trim(),
          bed: row.bed.trim(),
          plantingDate: recordTimestamp,
          quantityPlanted: qty,
          unit: row.unit,
          status: 'growing',
          logs: [{
            date: Timestamp.now(),
            description: `Plantio inicial de ${row.crop.trim()} (${qty} ${row.unit}) registrado via Plantio Coletivo.`
          }],
          createdAt: serverTimestamp()
        };
        await addDoc(collection(db, 'production'), newPlanting);
      }

      // Also let's register the activity in bed records (the prontuário) for full integration!
      for (const row of collectiveRows) {
        const qty = Number(row.quantity);
        const recordData = {
          bedId: row.bed.trim(),
          crop: row.crop.trim(),
          date: recordTimestamp,
          activityType: 'planting',
          notes: `Plantio coletivo de ${row.crop.trim()} (${qty} ${row.unit}) registrado.`,
          syncedToProduction: true,
          employeeName: profile?.displayName || 'Dono',
          createdAt: serverTimestamp()
        };
        await addDoc(collection(db, 'bed_records'), recordData);
      }

      setIsCollectivePlantingOpen(false);
      setCollectiveRows([{ bed: '', crop: '', quantity: '', unit: 'un' }]);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'production');
    } finally {
      setLoading(false);
    }
  };

  // Handle inline saving of canteiro details
  const saveInlineEdit = async (bedName: string) => {
    if (!editCrop.trim()) {
      alert('Por favor, digite o nome da cultura/verdura plantada!');
      return;
    }
    if (editQuantity <= 0) {
      alert('A quantidade plantada deve ser maior que zero!');
      return;
    }

    try {
      setLoading(true);
      const plantingDateVal = new Date(editDate);

      if (editingProductionId) {
        // EDIT EXISTING record
        const prodRef = doc(db, 'production', editingProductionId);
        await updateDoc(prodRef, {
          crop: editCrop.trim(),
          plantingDate: Timestamp.fromDate(plantingDateVal),
          quantityPlanted: Number(editQuantity),
          unit: editUnit,
          bed: bedName
        });
      } else {
        // NEW PLANTING on an empty bed
        const newPlanting = {
          crop: editCrop.trim(),
          bed: bedName,
          plantingDate: Timestamp.fromDate(plantingDateVal),
          quantityPlanted: Number(editQuantity),
          unit: editUnit,
          status: 'growing',
          logs: [{
            date: Timestamp.now(),
            description: `Plantio inicial de ${editCrop.trim()} (${editQuantity} ${editUnit}) registrado.`
          }],
          createdAt: serverTimestamp()
        };
        await addDoc(collection(db, 'production'), newPlanting);
      }

      // Clear edit state
      cancelEditing();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'production');
    } finally {
      setLoading(false);
    }
  };

  // Mark crop as loss
  const handleMarkLoss = async (prod: Production) => {
    confirmAction(
      'Registrar Perda de Cultivo',
      `Tem certeza que deseja marcar o cultivo de "${prod.crop}" no "${prod.bed}" como PERDA?`,
      'Confirmar Perda',
      async () => {
        try {
          setLoading(true);
          const prodRef = doc(db, 'production', prod.id);
          await updateDoc(prodRef, {
            status: 'lost',
            harvestDate: serverTimestamp()
          });
          alert('Cultivo finalizado com registro de perda.');
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'production');
        } finally {
          setLoading(false);
        }
      }
    );
  };

  // Delete production record completely
  const handleDeleteRecord = async (prodId: string) => {
    confirmAction(
      'Excluir Registro de Cultivo',
      'Deseja excluir permanentemente este registro de cultivo do sistema? Esta ação é irreversível.',
      'Excluir',
      async () => {
        try {
          setLoading(true);
          await deleteDoc(doc(db, 'production', prodId));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, 'production');
        } finally {
          setLoading(false);
        }
      }
    );
  };

  // Open harvest dialog
  const openHarvestDialog = (prod: Production) => {
    setHarvestingItem(prod);
    setHarvestQty(String(prod.quantityPlanted));
    setHarvestPackages('');
    setHarvestDate(new Date().toISOString().split('T')[0]);
    setHarvestType('partial');
    setAddToInventory(true);
    
    // Initialize product integration states
    setNewProductName(prod.crop);
    setNewProductUnit(prod.unit || 'un');
    setNewProductPrice('5.00');
    setNewProductCostPrice('0.00');
    setNewProductMinStock('10');
    setNewProductCategory('Hortaliças');

    // Find if there is a catalog product with the same name as the crop
    let matchingCatalogItem = produceCatalog.find(
      item => item.name.toLowerCase() === prod.crop.toLowerCase()
    );

    // If not found and crop or bed has "alface roxa" (case-insensitive), try to find any catalog product containing "alface roxa"
    const isAlfaceRoxa = prod.crop.toLowerCase().includes('alface roxa') || prod.bed.toLowerCase().includes('alface roxa');
    if (!matchingCatalogItem && isAlfaceRoxa) {
      matchingCatalogItem = produceCatalog.find(
        item => item.name.toLowerCase().includes('alface roxa')
      );
    }

    if (matchingCatalogItem) {
      setSelectedCatalogItemId(matchingCatalogItem.id);
    } else {
      setSelectedCatalogItemId('');
    }
    setHarvestProductMode('existing');
  };

  // Handle harvest submission
  const submitHarvest = async () => {
    if (!harvestingItem) return;
    const qty = Number(harvestQty);
    if (isNaN(qty) || qty <= 0) {
      alert('Insira uma quantidade colhida válida!');
      return;
    }

    const pkgs = Number(harvestPackages) || 0;

    try {
      setLoading(true);

      const isFinal = harvestType === 'final';
      const newStatus = isFinal ? 'harvested' : 'growing';
      const packagesText = pkgs > 0 ? ` (${pkgs} pacotes)` : '';

      const harvestLog = {
        date: Timestamp.fromDate(new Date(harvestDate)),
        description: isFinal 
          ? `Colheita Final realizada: ${qty} ${harvestingItem.unit || 'unidades'}${packagesText}. Lote finalizado.` 
          : `Colheita Parcial realizada: ${qty} ${harvestingItem.unit || 'unidades'}${packagesText}. Lote continua ativo para mais colheitas.`,
        products: [],
        packages: pkgs > 0 ? pkgs : undefined
      };

      // Update production cycle in Firestore
      const prodRef = doc(db, 'production', harvestingItem.id);
      const updatePayload: any = {
        status: newStatus,
        harvestDate: Timestamp.fromDate(new Date(harvestDate)),
        harvestQuantity: increment(qty),
        remainingQuantity: increment(qty),
        logs: [...(harvestingItem.logs || []), harvestLog]
      };
      
      if (pkgs > 0) {
        updatePayload.harvestPackages = increment(pkgs);
      }

      await updateDoc(prodRef, updatePayload);

      // Register activity in bed records for clinical history sync
      await addDoc(collection(db, 'bed_records'), {
        bedId: harvestingItem.bed,
        date: Timestamp.fromDate(new Date(harvestDate)),
        crop: harvestingItem.crop,
        activityType: 'harvest',
        employeeName: profile?.displayName || 'Dono',
        notes: `Colheita registrada na planilha de canteiros.${pkgs > 0 ? ` Rendimento: ${pkgs} pacotes.` : ''}`,
        syncedToProduction: true,
        harvestQuantity: qty,
        harvestUnit: harvestingItem.unit || 'un',
        harvestPackages: pkgs > 0 ? pkgs : undefined,
        productionId: harvestingItem.id,
        createdAt: serverTimestamp()
      });

      // Integrate into inventory if requested
      if (addToInventory) {
        const incrementQty = pkgs > 0 ? pkgs : qty;

        if (harvestProductMode === 'existing') {
          if (!selectedCatalogItemId) {
            alert('Por favor, selecione um produto do catálogo!');
            setLoading(false);
            return;
          }

          const catalogItem = produceCatalog.find(item => item.id === selectedCatalogItemId);
          if (!catalogItem) {
            alert('Produto do catálogo não encontrado!');
            setLoading(false);
            return;
          }

          // Check if this product already exists in inventory (type === 'dispatch')
          const existingInventoryItem = inventory.find(
            item => item.type === 'dispatch' && item.name.toLowerCase() === catalogItem.name.toLowerCase()
          );

          let targetItemId = '';

          if (existingInventoryItem) {
            // Increment quantity of existing inventory item
            const itemRef = doc(db, 'inventory', existingInventoryItem.id);
            await updateDoc(itemRef, {
              quantity: increment(incrementQty),
              lastUpdated: serverTimestamp()
            });
            targetItemId = existingInventoryItem.id;
          } else {
            // Create a new inventory item for this catalog product
            const docRef = await addDoc(collection(db, 'inventory'), {
              name: catalogItem.name,
              type: 'dispatch',
              category: catalogItem.category || 'Hortaliças',
              quantity: incrementQty,
              unit: catalogItem.unit || 'un',
              price: catalogItem.defaultPrice || 0,
              costPrice: 0,
              minStock: 10,
              lastUpdated: serverTimestamp()
            });
            targetItemId = docRef.id;
          }

          // Register in inventory history
          await addDoc(collection(db, 'inventory_history'), {
            itemId: targetItemId,
            itemName: catalogItem.name,
            quantity: incrementQty,
            unit: catalogItem.unit || 'un',
            costPrice: 0,
            price: catalogItem.defaultPrice || 0,
            type: 'harvest',
            description: `Colheita no canteiro ${harvestingItem.bed}: ${qty} ${harvestingItem.unit || 'un'} colhidos${pkgs > 0 ? `, rendendo ${pkgs} pacotes no estoque.` : ''}`,
            date: serverTimestamp()
          });

        } else {
          // Create new dispatch item in inventory on the fly
          if (!newProductName.trim()) {
            alert('Por favor, informe o nome do novo produto para cadastro!');
            setLoading(false);
            return;
          }
          
          const docRef = await addDoc(collection(db, 'inventory'), {
            name: newProductName.trim(),
            type: 'dispatch',
            category: newProductCategory.trim() || 'Hortaliças',
            quantity: incrementQty,
            unit: newProductUnit,
            price: Number(newProductPrice) || 0,
            costPrice: Number(newProductCostPrice) || 0,
            minStock: Number(newProductMinStock) || 0,
            lastUpdated: serverTimestamp()
          });

          // Register in inventory history
          await addDoc(collection(db, 'inventory_history'), {
            itemId: docRef.id,
            itemName: newProductName.trim(),
            quantity: incrementQty,
            unit: newProductUnit,
            costPrice: Number(newProductCostPrice) || 0,
            price: Number(newProductPrice) || 0,
            type: 'harvest',
            description: `Colheita no canteiro ${harvestingItem.bed}: ${qty} ${harvestingItem.unit || 'un'} colhidos${pkgs > 0 ? `, rendendo ${pkgs} pacotes no estoque.` : ''}`,
            date: serverTimestamp()
          });
        }
      }

      setHarvestingItem(null);
      if (isFinal) {
        alert(`Colheita Final registrada com sucesso! ${qty} ${harvestingItem.unit || 'un'} de ${harvestingItem.crop} finalizados.`);
      } else {
        alert(`Colheita Parcial de ${qty} ${harvestingItem.unit || 'un'} registrada com sucesso! O lote de ${harvestingItem.crop} continua ativo.`);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'production');
    } finally {
      setLoading(false);
    }
  };

  // Filter beds or records
  const filteredBedsList = useMemo(() => {
    return allBedsList.filter(bedName => {
      // Find active growing crop for this bed
      const activeCrop = productions.find(p => p.bed === bedName && p.status === 'growing');
      const matchesSearch = bedName.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (activeCrop && activeCrop.crop.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchesSearch;
    });
  }, [allBedsList, productions, searchTerm]);

  const filteredHistory = useMemo(() => {
    return productions.filter(p => {
      const matchesSearch = p.crop.toLowerCase().includes(searchTerm.toLowerCase()) || p.bed.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [productions, searchTerm, statusFilter]);

  const filteredCatalog = useMemo(() => {
    return produceCatalog.filter(item => {
      return item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.category && item.category.toLowerCase().includes(searchTerm.toLowerCase()));
    });
  }, [produceCatalog, searchTerm]);

  // Excel-style totals/summary stats
  const activeCount = useMemo(() => productions.filter(p => p.status === 'growing').length, [productions]);
  const totalCanteiros = allBedsList.length;
  const occupancyRate = totalCanteiros > 0 ? Math.round((activeCount / totalCanteiros) * 100) : 0;
  
  const sumPlantedQty = useMemo(() => {
    return productions
      .filter(p => p.status === 'growing')
      .reduce((acc, p) => acc + (p.quantityPlanted || 0), 0);
  }, [productions]);

  const averageDaysInField = useMemo(() => {
    const activeCrops = productions.filter(p => p.status === 'growing');
    if (activeCrops.length === 0) return 0;
    const totalDays = activeCrops.reduce((acc, p) => acc + getDaysInField(p.plantingDate), 0);
    return Math.round(totalDays / activeCrops.length);
  }, [productions]);

  // Simulate spreadsheet export to CSV
  const handleExportCSV = () => {
    try {
      let csvContent = "data:text/csv;charset=utf-8,";
      
      if (activeTab === 'spreadsheet') {
        csvContent += "Canteiro,Status,Cultura Plantada,Data do Plantio,Quantidade Plantada,Unidade,Dias no Campo\n";
        allBedsList.forEach(bed => {
          const active = productions.filter(p => p.bed === bed && p.status === 'growing');
          if (active.length > 0) {
            active.forEach(p => {
              const dateStr = formatDate(p.plantingDate);
              csvContent += `"${bed}","Em Crescimento","${p.crop}","${dateStr}",${p.quantityPlanted},"${p.unit || 'un'}",${getDaysInField(p.plantingDate)}\n`;
            });
          } else {
            csvContent += `"${bed}","Vazio","-","-",0,"-",-\n`;
          }
        });
      } else {
        csvContent += "Canteiro,Cultura,Data de Plantio,Quantidade,Unidade,Status,Data de Finalização,Quantidade Colhida\n";
        productions.forEach(p => {
          const plantDate = formatDate(p.plantingDate);
          const endDate = p.harvestDate ? formatDate(p.harvestDate) : '-';
          const statusText = p.status === 'growing' ? 'Em Crescimento' : p.status === 'harvested' ? 'Colhido' : 'Perda';
          csvContent += `"${p.bed}","${p.crop}","${plantDate}",${p.quantityPlanted},"${p.unit || 'un'}","${statusText}","${endDate}",${p.harvestQuantity || 0}\n`;
        });
      }

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `planilha_producao_${activeTab === 'spreadsheet' ? 'canteiros' : 'historico'}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      alert('Erro ao exportar arquivo.');
    }
  };

  // Find currently selected row info for formula bar display
  const selectedRowInfo = useMemo(() => {
    if (!selectedRowId) return null;
    if (activeTab === 'spreadsheet') {
      const activeCrop = productions.find(p => p.bed === selectedRowId && p.status === 'growing');
      if (activeCrop) {
        return {
          title: selectedRowId,
          desc: `Cultura: ${activeCrop.crop} | Plantio: ${formatDate(activeCrop.plantingDate)} | Qtd: ${activeCrop.quantityPlanted} ${activeCrop.unit || 'un'} | Dias: ${getDaysInField(activeCrop.plantingDate)} dias no campo.`
        };
      }
      return {
        title: selectedRowId,
        desc: `Sem cultivos ativos registrados (Vazio). Prontos para realizar novo plantio.`
      };
    } else if (activeTab === 'history') {
      const item = productions.find(p => p.id === selectedRowId);
      if (item) {
        const statusText = item.status === 'growing' ? 'Ativo' : item.status === 'harvested' ? 'Colhido' : 'Perda';
        return {
          title: `Lançamento ${item.id.slice(0, 6)}`,
          desc: `Canteiro: ${item.bed} | Cultura: ${item.crop} | Status: ${statusText} | Qtd Plantado: ${item.quantityPlanted} ${item.unit || 'un'} | Plantio: ${formatDate(item.plantingDate)}${item.harvestDate ? ` | Finalizado em: ${formatDate(item.harvestDate)}` : ''}`
        };
      }
    } else if (activeTab === 'catalog') {
      const item = produceCatalog.find(c => c.id === selectedRowId);
      if (item) {
        return {
          title: item.name,
          desc: `Categoria: ${item.category} | Unidade: ${item.unit} | Ciclo estimado: ${item.estimatedDaysToHarvest} dias | Preço Sugerido: R$ ${Number(item.defaultPrice).toFixed(2)}`
        };
      }
    }
    return null;
  }, [selectedRowId, productions, activeTab]);

  return (
    <div className="min-h-screen bg-slate-50/70 p-4 md:p-8 font-sans text-slate-800">
      
      {/* 1. Header with Horta Brand Vibe */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full font-extrabold uppercase tracking-widest">
            Horta & Produção
          </span>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mt-1.5 flex items-center gap-2">
            <Sprout className="text-emerald-600" size={32} />
            Controle de Canteiros
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gerenciamento simplificado em formato de planilha Excel para o plantio e controle da horta.
          </p>
        </div>

        {/* Excel style export & add buttons */}
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          <button
            onClick={() => {
              setCollectiveRows([{ bed: '', crop: '', quantity: '', unit: 'un' }]);
              setIsCollectivePlantingOpen(true);
            }}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm hover:shadow cursor-pointer"
          >
            <Sprout size={16} />
            + Plantio Coletivo
          </button>

          <button
            onClick={() => setIsAddingBed(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm hover:shadow cursor-pointer"
          >
            <Plus size={16} />
            + Adicionar Canteiro
          </button>
          
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer"
          >
            <Download size={16} className="text-slate-400" />
            Exportar Excel (CSV)
          </button>
        </div>
      </div>

      {/* 2. Top Stats Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-emerald-500/50 transition-all">
          <p className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Canteiros Totais</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-slate-900">{totalCanteiros}</span>
            <span className="text-xs font-bold text-slate-400">fileiras</span>
          </div>
          <div className="absolute right-3 bottom-3 text-slate-100 group-hover:text-emerald-50/70 transition-colors">
            <Layers size={40} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-emerald-500/50 transition-all">
          <p className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Canteiros Ocupados</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-emerald-700">{activeCount}</span>
            <span className="text-xs font-bold text-slate-400">ativos</span>
          </div>
          <div className="absolute right-3 bottom-3 text-emerald-50/30 group-hover:text-emerald-100/40 transition-colors">
            <Sprout size={40} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-emerald-500/50 transition-all">
          <p className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Total de Mudas Plantadas</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-slate-900">{sumPlantedQty.toLocaleString('pt-BR')}</span>
            <span className="text-xs font-bold text-slate-400">unidades</span>
          </div>
          <div className="absolute right-3 bottom-3 text-slate-100 group-hover:text-emerald-50/70 transition-colors">
            <TrendingUp size={40} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-emerald-500/50 transition-all">
          <p className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Taxa de Ocupação</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-slate-900">{occupancyRate}%</span>
            <span className="text-xs font-bold text-slate-400">da horta</span>
          </div>
          <div className="absolute right-3 bottom-3 text-slate-100 group-hover:text-emerald-50/70 transition-colors">
            <CheckSquare size={40} />
          </div>
        </div>
      </div>

      {/* 3. Modal to Add New Bed Row */}
      <AnimatePresence>
        {isAddingBed && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-sm w-full p-6"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <h3 className="text-base font-black text-slate-900">Novo Canteiro</h3>
                <button 
                  onClick={() => setIsAddingBed(false)}
                  className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAddBed} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1">
                    Nome ou Número do Canteiro
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Canteiro 13, Canteiro Lateral B"
                    value={newBedName}
                    onChange={(e) => setNewBedName(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                    Este canteiro será inserido permanentemente na planilha do seu painel ativo.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingBed(false)}
                    className="px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold uppercase tracking-wider shadow-sm transition-colors cursor-pointer"
                  >
                    Adicionar Linha
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Collective Planting Modal */}
      <AnimatePresence>
        {isCollectivePlantingOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-4xl w-full p-6 flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Sprout className="text-indigo-600 animate-pulse" size={22} />
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Plantio Coletivo</h3>
                    <p className="text-xs text-slate-500">Registre o plantio em múltiplos canteiros simultaneamente</p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setIsCollectivePlantingOpen(false)}
                  className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSaveCollectivePlanting} className="space-y-4 flex-1 flex flex-col overflow-hidden">
                {/* Data do Plantio */}
                <div className="w-full sm:w-64">
                  <label className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1">
                    Data do Plantio
                  </label>
                  <input
                    type="date"
                    required
                    value={collectivePlantingDate}
                    onChange={(e) => setCollectivePlantingDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                {/* Rows Area */}
                <div className="flex-1 overflow-y-auto pr-2 space-y-3 min-h-[200px]">
                  <div className="hidden sm:grid sm:grid-cols-12 gap-3 px-2 text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
                    <div className="col-span-3">Canteiro [A]</div>
                    <div className="col-span-4">Cultura / Verdura [C]</div>
                    <div className="col-span-3">Quantidade [E]</div>
                    <div className="col-span-2 text-center">Ação</div>
                  </div>

                  {collectiveRows.map((row, index) => (
                    <div 
                      key={index} 
                      className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-3 sm:p-2 bg-slate-50 sm:bg-transparent rounded-xl border border-slate-100 sm:border-none items-center"
                    >
                      {/* Canteiro */}
                      <div className="col-span-3">
                        <label className="block sm:hidden text-[9px] font-bold text-slate-400 uppercase mb-1">Canteiro</label>
                        <select
                          required
                          value={row.bed}
                          onChange={(e) => {
                            const updated = [...collectiveRows];
                            updated[index].bed = e.target.value;
                            setCollectiveRows(updated);
                          }}
                          className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                        >
                          <option value="">Selecione...</option>
                          {allBedsList.map(bed => (
                            <option key={bed} value={bed}>{bed}</option>
                          ))}
                        </select>
                      </div>

                      {/* Cultura */}
                      <div className="col-span-4">
                        <label className="block sm:hidden text-[9px] font-bold text-slate-400 uppercase mb-1">Cultura</label>
                        <select
                          required
                          value={row.crop}
                          onChange={(e) => {
                            const updated = [...collectiveRows];
                            const selectedCropName = e.target.value;
                            updated[index].crop = selectedCropName;
                            // Pre-fill unit based on catalog or standards
                            const catItem = produceCatalog.find(item => item.name === selectedCropName);
                            if (catItem) {
                              updated[index].unit = catItem.unit || 'un';
                            }
                            setCollectiveRows(updated);
                          }}
                          className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                        >
                          <option value="">Selecione a cultura...</option>
                          <optgroup label="Seus Cultivos Cadastrados">
                            {produceCatalog.map(item => (
                              <option key={item.id} value={item.name}>{item.name}</option>
                            ))}
                          </optgroup>
                          <optgroup label="Outros Cultivos Padrão">
                            {STANDARD_CROPS
                              .filter(c => !produceCatalog.some(item => item.name === c))
                              .map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))
                            }
                          </optgroup>
                        </select>
                      </div>

                      {/* Quantidade & Unidade */}
                      <div className="col-span-3 flex items-center gap-1.5 font-mono">
                        <div className="flex-1">
                          <label className="block sm:hidden text-[9px] font-bold text-slate-400 uppercase mb-1">Quantidade</label>
                          <input
                            type="number"
                            required
                            min="1"
                            placeholder="Qtd"
                            value={row.quantity}
                            onChange={(e) => {
                              const updated = [...collectiveRows];
                              updated[index].quantity = e.target.value;
                              setCollectiveRows(updated);
                            }}
                            className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 font-mono text-right"
                          />
                        </div>
                        <div className="w-20">
                          <label className="block sm:hidden text-[9px] font-bold text-slate-400 uppercase mb-1">Unidade</label>
                          <select
                            value={row.unit}
                            onChange={(e) => {
                              const updated = [...collectiveRows];
                              updated[index].unit = e.target.value;
                              setCollectiveRows(updated);
                            }}
                            className="w-full px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 font-sans"
                          >
                            {STANDARD_UNITS.map(u => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Delete Action */}
                      <div className="col-span-2 text-center pt-2 sm:pt-0">
                        {collectiveRows.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setCollectiveRows(collectiveRows.filter((_, i) => i !== index));
                            }}
                            className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-all w-full sm:w-auto flex items-center justify-center gap-1.5 text-xs font-bold uppercase sm:normal-case border border-transparent hover:border-rose-100 sm:border-none cursor-pointer"
                          >
                            <Trash2 size={15} />
                            <span className="sm:hidden">Remover Linha</span>
                          </button>
                        ) : (
                          <span className="text-slate-300 text-xs hidden sm:inline">-</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Row and Save Controls */}
                <div className="border-t border-slate-100 pt-4 flex flex-col sm:flex-row justify-between items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setCollectiveRows([...collectiveRows, { bed: '', crop: '', quantity: '', unit: 'un' }]);
                    }}
                    className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer border border-slate-200"
                  >
                    <PlusCircle size={15} />
                    + Adicionar outro Canteiro
                  </button>

                  <div className="w-full sm:w-auto flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsCollectivePlantingOpen(false)}
                      className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wider text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer text-center"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 sm:flex-initial px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold uppercase tracking-wider shadow-sm hover:shadow transition-colors cursor-pointer text-center disabled:opacity-50 font-black"
                    >
                      {loading ? 'Registrando...' : 'Registrar Plantios'}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. Excel-Style Sheet Tabs & Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-6">
        
        {/* Excel style ribbon toolbar */}
        <div className="bg-slate-50 border-b border-slate-200 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          {/* Tabs with Excel Sheet Style */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setActiveTab('spreadsheet');
                setSelectedRowId(null);
                cancelEditing();
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'spreadsheet' 
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-xs' 
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <FileSpreadsheet size={15} />
              Planilha de Canteiros (Ativos)
            </button>
            
            <button
              onClick={() => {
                setActiveTab('history');
                setSelectedRowId(null);
                cancelEditing();
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'history' 
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-xs' 
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <ClipboardList size={15} />
              Histórico Geral de Lançamentos
            </button>

            <button
              onClick={() => {
                setActiveTab('catalog');
                setSelectedRowId(null);
                cancelEditing();
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'catalog' 
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-xs' 
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <Sprout size={15} />
              Catálogo de Cultivos (Produtos)
            </button>
          </div>

          {/* Quick Filters inside spreadsheet header */}
          <div className="flex items-center gap-2">
            {activeTab === 'history' && (
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none border-none p-0 pr-6"
                >
                  <option value="all">Todos</option>
                  <option value="growing">Em Crescimento</option>
                  <option value="harvested">Colhidos</option>
                  <option value="lost">Perdas</option>
                </select>
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder={activeTab === 'spreadsheet' ? "Buscar canteiro ou cultura..." : "Buscar cultura ou canteiro..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-3.5 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white w-48 sm:w-56 placeholder-slate-400"
              />
            </div>
          </div>
        </div>

        {/* 5. Excel Formula Bar Display */}
        <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-3 text-xs">
          <div className="font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-100 select-none">
            fx
          </div>
          <div className="h-4 w-[1px] bg-slate-200" />
          <div className="flex-1 font-mono text-slate-500 truncate select-none">
            {selectedRowInfo ? (
              <span>
                <strong className="text-slate-800 font-sans font-bold">{selectedRowInfo.title}:</strong> {selectedRowInfo.desc}
              </span>
            ) : (
              <span className="italic text-slate-400">Clique em qualquer linha da planilha para visualizar a barra de fórmulas...</span>
            )}
          </div>
        </div>

        {/* 6. Main Interactive Spreadsheet Grid */}
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-slate-500 font-semibold">Carregando dados da horta...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            
            {/* TAB 1: SpreadSheet View (Each bed is a line) */}
            {activeTab === 'spreadsheet' && (
              <table className="w-full text-left border-collapse select-none">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {/* Excel numbering column header */}
                    <th className="py-2 px-3 text-center border-r border-slate-200 w-12 bg-slate-100 font-mono text-slate-400 select-none">#</th>
                    <th className="py-2.5 px-4 border-r border-slate-200 w-44 font-black text-slate-700">Nº do Canteiro [A]</th>
                    <th className="py-2.5 px-4 border-r border-slate-200 w-40 font-black text-slate-700">Status [B]</th>
                    <th className="py-2.5 px-4 border-r border-slate-200 w-64 font-black text-slate-700">Cultura Plantada [C]</th>
                    <th className="py-2.5 px-4 border-r border-slate-200 w-44 font-black text-slate-700">Data de Plantio [D]</th>
                    <th className="py-2.5 px-4 border-r border-slate-200 w-40 font-black text-slate-700">Qtd. Plantada [E]</th>
                    <th className="py-2.5 px-4 border-r border-slate-200 w-36 font-black text-slate-700">Idade [F]</th>
                    <th className="py-2.5 px-4 text-center font-black text-slate-700">Ações Rápidas [G]</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 text-xs">
                  {filteredBedsList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        Nenhum canteiro coincide com sua busca.
                      </td>
                    </tr>
                  ) : (
                    filteredBedsList.map((bedName, idx) => {
                      // Get active growing crop for this bed
                      const activeCrop = productions.find(p => p.bed === bedName && p.status === 'growing');
                      const isEditing = editingBedName === bedName;
                      const isSelected = selectedRowId === bedName;

                      return (
                        <tr 
                          key={bedName}
                          onClick={() => setSelectedRowId(bedName)}
                          className={`group transition-colors border-b border-slate-100 ${
                            isEditing 
                              ? 'bg-emerald-50/30' 
                              : isSelected 
                                ? 'bg-emerald-50/15 ring-1 ring-emerald-500/10' 
                                : 'hover:bg-slate-50/50'
                          }`}
                        >
                          {/* Row Number Column */}
                          <td className="py-3 px-3 text-center border-r border-slate-200 bg-slate-50 font-mono text-slate-400 font-semibold select-none text-[11px]">
                            {idx + 1}
                          </td>

                          {/* Canteiro Name */}
                          <td className="py-3 px-4 font-bold text-slate-900 border-r border-slate-150">
                            <div className="flex items-center justify-between">
                              <span>{bedName}</span>
                              {/* Option to delete custom bed */}
                              {customBeds.includes(bedName) && !isEditing && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveBed(bedName);
                                  }}
                                  title="Remover este canteiro da planilha"
                                  className="opacity-0 group-hover:opacity-100 p-0.5 text-rose-500 hover:bg-rose-50 rounded transition-all cursor-pointer"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-3 px-4 border-r border-slate-150">
                            {isEditing ? (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md font-bold uppercase">
                                {editingProductionId ? 'Editando...' : 'Plantando...'}
                              </span>
                            ) : activeCrop ? (
                              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200/50 px-2.5 py-0.5 rounded-full text-[11px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                Em Crescimento
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 border border-slate-200/60 px-2.5 py-0.5 rounded-full text-[11px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                Canteiro Vazio
                              </span>
                            )}
                          </td>

                          {/* Cultura Plantada */}
                          <td className="py-3 px-4 border-r border-slate-150">
                            {isEditing ? (
                              <div className="relative">
                                <input
                                  type="text"
                                  placeholder="Digite a cultura"
                                  value={editCrop}
                                  onChange={(e) => setEditCrop(e.target.value)}
                                  onFocus={() => setShowCropSuggestions(true)}
                                  onBlur={() => setTimeout(() => setShowCropSuggestions(false), 250)}
                                  className="w-full px-2 py-1 border border-slate-300 rounded font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 bg-white text-xs"
                                />
                                {showCropSuggestions && (
                                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto z-10 p-1.5 space-y-1">
                                    {produceCatalog.length > 0 && (
                                      <>
                                        <p className="text-[9px] font-black text-emerald-700 uppercase tracking-wider px-2 py-0.5">Seus Cultivos Cadastrados:</p>
                                        {produceCatalog
                                          .filter(item => !editCrop || item.name.toLowerCase().includes(editCrop.toLowerCase()))
                                          .map(item => (
                                            <button
                                              key={item.id}
                                              type="button"
                                              onMouseDown={() => {
                                                setEditCrop(item.name);
                                                setEditUnit(item.unit || 'un');
                                              }}
                                              className="w-full text-left px-2 py-1 hover:bg-emerald-50 rounded text-[11px] font-semibold text-slate-700 cursor-pointer flex justify-between items-center"
                                            >
                                              <span>{item.name}</span>
                                              <span className="text-[9px] text-emerald-600 bg-emerald-50 px-1 rounded">
                                                {item.unit} • {item.estimatedDaysToHarvest}d
                                              </span>
                                            </button>
                                          ))}
                                        <div className="border-t border-slate-100 my-1" />
                                      </>
                                    )}
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider px-2 py-0.5">Sugestões Padrão:</p>
                                    {STANDARD_CROPS
                                      .filter(crop => !editCrop || crop.toLowerCase().includes(editCrop.toLowerCase()))
                                      .map(crop => (
                                        <button
                                          key={crop}
                                          type="button"
                                          onMouseDown={() => setEditCrop(crop)}
                                          className="w-full text-left px-2 py-1 hover:bg-slate-50 rounded text-[11px] font-semibold text-slate-700 cursor-pointer"
                                        >
                                          {crop}
                                        </button>
                                      ))}
                                  </div>
                                )}
                              </div>
                            ) : activeCrop ? (
                              <div className="flex items-center gap-2">
                                <div className="p-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded">
                                  <Sprout size={13} />
                                </div>
                                <span className="font-bold text-slate-800">{activeCrop.crop}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic font-mono">-</span>
                            )}
                          </td>

                          {/* Data de Plantio */}
                          <td className="py-3 px-4 border-r border-slate-150 font-mono">
                            {isEditing ? (
                              <input
                                type="date"
                                value={editDate}
                                onChange={(e) => setEditDate(e.target.value)}
                                className="w-full px-2 py-1 border border-slate-300 rounded text-slate-800 focus:outline-none focus:border-emerald-500 bg-white text-[11px]"
                              />
                            ) : activeCrop ? (
                              <div className="flex items-center gap-1.5 text-slate-600">
                                <Calendar size={13} className="text-slate-400" />
                                <span>{formatDate(activeCrop.plantingDate)}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">-</span>
                            )}
                          </td>

                          {/* Quantidade Plantada */}
                          <td className="py-3 px-4 border-r border-slate-150">
                            {isEditing ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min="1"
                                  value={editQuantity}
                                  onChange={(e) => setEditQuantity(Number(e.target.value))}
                                  className="w-20 px-2 py-1 border border-slate-300 rounded text-slate-800 focus:outline-none focus:border-emerald-500 bg-white font-mono"
                                />
                                <select
                                  value={editUnit}
                                  onChange={(e) => setEditUnit(e.target.value)}
                                  className="px-1.5 py-1 border border-slate-300 rounded text-slate-800 focus:outline-none focus:border-emerald-500 bg-white text-[11px]"
                                >
                                  {STANDARD_UNITS.map(u => (
                                    <option key={u} value={u}>{u}</option>
                                  ))}
                                </select>
                              </div>
                            ) : activeCrop ? (
                              <span className="font-mono font-bold text-slate-800">
                                {activeCrop.quantityPlanted} <span className="text-[10px] text-slate-400 font-sans font-normal uppercase">{activeCrop.unit || 'un'}</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 italic font-mono">-</span>
                            )}
                          </td>

                          {/* Idade no Campo */}
                          <td className="py-3 px-4 border-r border-slate-150 font-mono font-bold text-slate-600">
                            {activeCrop ? (
                              <span>
                                {getDaysInField(activeCrop.plantingDate)} <span className="text-[10px] text-slate-400 font-sans font-normal">dias</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">-</span>
                            )}
                          </td>

                          {/* Action Buttons inside the Excel Row */}
                          <td className="py-2.5 px-4 text-center">
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => saveInlineEdit(bedName)}
                                  title="Confirmar e Salvar no Banco de Dados"
                                  className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs transition-colors cursor-pointer"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditing}
                                  title="Descartar Alterações"
                                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors cursor-pointer"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ) : activeCrop ? (
                              <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => openHarvestDialog(activeCrop)}
                                  className="flex items-center gap-1 px-2.5 py-1 bg-emerald-100 hover:bg-emerald-600 hover:text-white text-emerald-800 border border-emerald-200 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs"
                                >
                                  Colher
                                </button>
                                
                                <button
                                  type="button"
                                  onClick={() => handleMarkLoss(activeCrop)}
                                  className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg border border-transparent hover:border-amber-100 transition-colors cursor-pointer"
                                  title="Marcar como Perda de Safra"
                                >
                                  <AlertTriangle size={13} />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => startEditing(bedName, activeCrop)}
                                  className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                  title="Editar Lançamento"
                                >
                                  <Edit2 size={13} />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteRecord(activeCrop.id)}
                                  className="p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                  title="Excluir Lançamento"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => startEditing(bedName)}
                                  className="flex items-center gap-1 px-3 py-1 bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-slate-200 hover:border-emerald-200 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer shadow-xs"
                                >
                                  <PlusCircle size={11} />
                                  Plantar
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}

            {/* TAB 2: History View (Full Listing of past cycles) */}
            {activeTab === 'history' && (
              <table className="w-full text-left border-collapse select-none">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-2 px-3 text-center border-r border-slate-200 w-12 bg-slate-100 font-mono text-slate-400 select-none">#</th>
                    <th className="py-2.5 px-4 border-r border-slate-200 w-44 font-black text-slate-700">Canteiro [A]</th>
                    <th className="py-2.5 px-4 border-r border-slate-200 w-44 font-black text-slate-700">Cultura [B]</th>
                    <th className="py-2.5 px-4 border-r border-slate-200 w-36 font-black text-slate-700">Status [C]</th>
                    <th className="py-2.5 px-4 border-r border-slate-200 w-44 font-black text-slate-700">Data Plantio [D]</th>
                    <th className="py-2.5 px-4 border-r border-slate-200 w-40 font-black text-slate-700">Qtd. Plantada [E]</th>
                    <th className="py-2.5 px-4 border-r border-slate-200 w-44 font-black text-slate-700">Data Finalização [F]</th>
                    <th className="py-2.5 px-4 border-r border-slate-200 w-40 font-black text-slate-700">Colhido [G]</th>
                    <th className="py-2.5 px-4 text-center font-black text-slate-700">Ações [H]</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 text-xs">
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        Nenhum registro histórico correspondente foi encontrado.
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((p, idx) => {
                      const isSelected = selectedRowId === p.id;
                      
                      return (
                        <tr
                          key={p.id}
                          onClick={() => setSelectedRowId(p.id)}
                          className={`transition-colors border-b border-slate-100 ${
                            isSelected ? 'bg-emerald-50/15 ring-1 ring-emerald-500/10' : 'hover:bg-slate-50/50'
                          }`}
                        >
                          <td className="py-3 px-3 text-center border-r border-slate-200 bg-slate-50 font-mono text-slate-400 font-semibold select-none text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800 border-r border-slate-150">
                            {p.bed}
                          </td>
                          <td className="py-3 px-4 border-r border-slate-150 font-semibold text-slate-900">
                            {p.crop}
                          </td>
                          <td className="py-3 px-4 border-r border-slate-150">
                            {p.status === 'growing' ? (
                              <span className="bg-amber-50 text-amber-800 border border-amber-200/50 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider">Ativo</span>
                            ) : p.status === 'harvested' ? (
                              <span className="bg-emerald-50 text-emerald-800 border border-emerald-200/50 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider">Colhido</span>
                            ) : (
                              <span className="bg-rose-50 text-rose-800 border border-rose-200/50 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider">Perda</span>
                            )}
                          </td>
                          <td className="py-3 px-4 border-r border-slate-150 font-mono">
                            {formatDate(p.plantingDate)}
                          </td>
                          <td className="py-3 px-4 border-r border-slate-150 font-mono">
                            {p.quantityPlanted} {p.unit || 'un'}
                          </td>
                          <td className="py-3 px-4 border-r border-slate-150 font-mono">
                            {p.harvestDate ? formatDate(p.harvestDate) : '-'}
                          </td>
                          <td className="py-3 px-4 border-r border-slate-150 font-mono font-bold text-slate-800">
                            {p.status === 'harvested' ? `${p.harvestQuantity || 0} ${p.unit || 'un'}` : p.status === 'lost' ? 'Perda' : '-'}
                          </td>
                          <td className="py-2.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => handleDeleteRecord(p.id)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer inline-flex items-center justify-center"
                              title="Excluir Registro"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}

            {/* TAB 3: Catalog View (Pre-registered producible crops) */}
            {activeTab === 'catalog' && (
              <div className="p-4 bg-white">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 bg-slate-50 border border-slate-200/60 p-4 rounded-2xl">
                  <div>
                    <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                      <Sprout size={16} className="text-emerald-600" />
                      Catálogo de Cultivos Planejados (Produtos)
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Cadastre aqui os produtos que você planeja produzir. Ao plantar em qualquer canteiro, os dados como ciclo de cultivo e unidade padrão serão herdados automaticamente do catálogo.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleImportStandardCrops}
                      className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      title="Importar os cultivos padrão recomendados para começar rapidamente"
                    >
                      <Download size={13} />
                      Importar Padrão
                    </button>
                    <button
                      type="button"
                      onClick={handleImportFromInventory}
                      className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      title="Importar produtos que já existem no estoque da expedição"
                    >
                      <Download size={13} />
                      Importar do Estoque
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCatalogItemId(null);
                        setCatalogName('');
                        setCatalogCategory('Hortaliças');
                        setCatalogUnit('un');
                        setCatalogDays('45');
                        setCatalogPrice('5.00');
                        setIsAddingCatalogItem(true);
                      }}
                      className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-xs cursor-pointer"
                    >
                      <Plus size={14} />
                      Novo Produto
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left border-collapse select-none">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="py-2.5 px-3 text-center border-r border-slate-200 w-12 bg-slate-100 font-mono text-slate-400 select-none">#</th>
                        <th className="py-2.5 px-4 border-r border-slate-200 font-black text-slate-700">Nome do Produto [A]</th>
                        <th className="py-2.5 px-4 border-r border-slate-200 font-black text-slate-700 w-44">Categoria [B]</th>
                        <th className="py-2.5 px-4 border-r border-slate-200 font-black text-slate-700 w-36">Unidade [C]</th>
                        <th className="py-2.5 px-4 border-r border-slate-200 font-black text-slate-700 w-40">Ciclo Médio [D]</th>
                        <th className="py-2.5 px-4 border-r border-slate-200 font-black text-slate-700 w-44">Preço Comercial [E]</th>
                        <th className="py-2.5 px-4 text-center font-black text-slate-700 w-28">Ações [F]</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 text-xs">
                      {filteredCatalog.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-400 font-semibold">
                            Nenhum produto cadastrado no catálogo correspondente. Clique em "Novo Produto" para cadastrar o primeiro!
                          </td>
                        </tr>
                      ) : (
                        filteredCatalog.map((item, idx) => {
                          const isSelected = selectedRowId === item.id;
                          return (
                            <tr
                              key={item.id}
                              onClick={() => setSelectedRowId(item.id)}
                              className={`transition-colors border-b border-slate-100 cursor-pointer ${
                                isSelected ? 'bg-emerald-50/15 ring-1 ring-emerald-500/10' : 'hover:bg-slate-50/50'
                              }`}
                            >
                              <td className="py-3 px-3 text-center border-r border-slate-200 bg-slate-50 font-mono text-slate-400 font-semibold select-none text-[11px]">
                                {idx + 1}
                              </td>
                              <td className="py-3 px-4 font-bold text-slate-800 border-r border-slate-150">
                                {item.name}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 text-slate-600 font-semibold">
                                {item.category || 'Hortaliças'}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150">
                                <span className="bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded text-[10px] uppercase">
                                  {item.unit || 'un'}
                                </span>
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 font-mono font-bold text-slate-600">
                                {item.estimatedDaysToHarvest} <span className="text-[10px] text-slate-400 font-normal">dias</span>
                              </td>
                              <td className="py-3 px-4 border-r border-slate-150 font-mono font-bold text-emerald-700">
                                R$ {Number(item.defaultPrice || 0).toFixed(2)}
                              </td>
                              <td className="py-2.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => startEditCatalogItem(item)}
                                    className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                                    title="Editar Produto"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCatalogItem(item.id)}
                                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                    title="Excluir Produto"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}

        {/* 7. Bottom Status Bar (Simulating Excel summary footer) */}
        <div className="bg-emerald-800 border-t border-emerald-900 px-4 py-2 flex flex-wrap items-center justify-between text-white font-mono text-[11px] select-none gap-y-1">
          <div className="flex items-center gap-3">
            <span className="bg-emerald-950 px-2 py-0.5 rounded text-[9px] font-black tracking-widest text-emerald-400">PRONTO</span>
            <span className="font-semibold">Planilha de Cultivo Ativa</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-emerald-100">
            <div>
              Total Canteiros: <span className="font-black text-white">{totalCanteiros}</span>
            </div>
            <div>
              Canteiros Ativos: <span className="font-black text-white">{activeCount}</span>
            </div>
            <div>
              Mudas Ativas: <span className="font-black text-white">{sumPlantedQty} un</span>
            </div>
            <div>
              Taxa Ocupação: <span className="font-black text-white">{occupancyRate}%</span>
            </div>
            {activeCount > 0 && (
              <div>
                Idade Média: <span className="font-black text-white">{averageDaysInField} dias</span>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 8. Harvest Action Modal (Elegant sliding/dialog overlay) */}
      <AnimatePresence>
        {harvestingItem && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-md w-full p-6 md:p-8"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <CheckSquare size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Registrar Colheita</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{harvestingItem.bed} • {harvestingItem.crop}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setHarvestingItem(null)}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                
                <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Quantidade Inicial</p>
                    <p className="text-xl font-black text-slate-800 mt-1">
                      {harvestingItem.quantityPlanted} <span className="text-xs text-slate-400 font-bold uppercase">{harvestingItem.unit || 'un'}</span>
                    </p>
                  </div>
                  <ChevronRight className="text-slate-300" size={20} />
                  <div className="text-right">
                    <p className="text-[10px] font-extrabold uppercase text-emerald-600 tracking-wider">Estocagem Final</p>
                    <p className="text-xl font-black text-emerald-700 mt-1">
                      {harvestQty || '0'} <span className="text-xs text-emerald-400 font-bold uppercase">{harvestingItem.unit || 'un'}</span>
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
                    Tipo de Colheita *
                  </label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl border border-slate-200/60">
                    <button
                      type="button"
                      onClick={() => setHarvestType('partial')}
                      className={`py-2 px-3 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        harvestType === 'partial'
                          ? 'bg-white text-emerald-800 shadow-sm border border-slate-200'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      🧺 Parcial
                    </button>
                    <button
                      type="button"
                      onClick={() => setHarvestType('final')}
                      className={`py-2 px-3 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        harvestType === 'final'
                          ? 'bg-white text-emerald-800 shadow-sm border border-slate-200'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      🏁 Final (Encerrar Lote)
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold leading-normal">
                    {harvestType === 'partial' 
                      ? '✓ O canteiro continua "Em Crescimento" e novos registros de colheita poderão ser feitos.' 
                      : '✓ O lote será finalizado ("Colhido") e o canteiro ficará livre para novos plantios.'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1.5">
                      Quantidade Colhida ({harvestingItem.unit || 'un'}) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={harvestQty}
                      onChange={(e) => setHarvestQty(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1.5">
                      Rendimento (Pacotes)
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Ex: 100"
                      value={harvestPackages}
                      onChange={(e) => setHarvestPackages(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1.5">
                    Data da Colheita
                  </label>
                  <input
                    type="date"
                    value={harvestDate}
                    onChange={(e) => setHarvestDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono"
                  />
                </div>

                {/* Sellable inventory linkage checkbox */}
                <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-2xl flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="addToInventory"
                    checked={addToInventory}
                    onChange={(e) => setAddToInventory(e.target.checked)}
                    className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 mt-0.5 cursor-pointer"
                  />
                  <div className="flex-1">
                    <label htmlFor="addToInventory" className="block text-xs font-bold text-emerald-900 select-none cursor-pointer">
                      Lançar no Estoque de Vendas (Expedição)
                    </label>
                    <p className="text-[10px] text-emerald-700/80 mt-1 leading-normal">
                      Ao selecionar, o sistema adicionará esta quantidade colhida diretamente ao estoque de vendas, deixando o produto pronto para faturamento.
                    </p>
                  </div>
                </div>

                {/* Subform for choosing or registering a product */}
                {addToInventory && (
                  <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-2xl space-y-3.5 transition-all">
                    <div className="flex items-center justify-between border-b border-slate-200/50 pb-2.5">
                      <span className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">
                        Destino no Estoque
                      </span>
                      
                      <div className="flex gap-1 bg-slate-200/60 p-0.5 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setHarvestProductMode('existing')}
                          className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold transition-all cursor-pointer ${
                            harvestProductMode === 'existing'
                              ? 'bg-white text-emerald-800 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Vincular Existente
                        </button>
                        <button
                          type="button"
                          onClick={() => setHarvestProductMode('new')}
                          className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold transition-all cursor-pointer ${
                            harvestProductMode === 'new'
                              ? 'bg-white text-emerald-800 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Cadastrar Novo
                        </button>
                      </div>
                    </div>

                    {harvestProductMode === 'existing' ? (
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-1.5">
                          Selecionar Produto do Catálogo
                        </label>
                        <select
                          value={selectedCatalogItemId}
                          onChange={(e) => setSelectedCatalogItemId(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        >
                          <option value="">-- Selecione um produto do catálogo --</option>
                          {produceCatalog.map(item => {
                            const inInv = inventory.find(i => i.type === 'dispatch' && i.name.toLowerCase() === item.name.toLowerCase());
                            return (
                              <option key={item.id} value={item.id}>
                                {item.name} ({item.unit}) {inInv ? `- Estoque atual: ${inInv.quantity}` : '- Sem estoque'}
                              </option>
                            );
                          })}
                        </select>
                        {produceCatalog.length === 0 && (
                          <p className="text-[10px] text-amber-600 font-medium mt-1">
                            Nenhum produto cadastrado no catálogo. Vá até a aba "Catálogo de Cultivos" para cadastrar os produtos de venda!
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-1.5">
                            Nome do Novo Produto Comercial
                          </label>
                          <input
                            type="text"
                            placeholder="Ex: Alface Crespa Orgânica"
                            value={newProductName}
                            onChange={(e) => setNewProductName(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-1.5">
                              Preço de Venda (R$)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="5.00"
                              value={newProductPrice}
                              onChange={(e) => setNewProductPrice(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-1.5">
                              Estoque Mínimo
                            </label>
                            <input
                              type="number"
                              placeholder="10"
                              value={newProductMinStock}
                              onChange={(e) => setNewProductMinStock(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-1.5">
                              Unidade de Venda
                            </label>
                            <select
                              value={newProductUnit}
                              onChange={(e) => setNewProductUnit(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                            >
                              {STANDARD_UNITS.map(u => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-1.5">
                              Categoria
                            </label>
                            <select
                              value={newProductCategory}
                              onChange={(e) => setNewProductCategory(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                            >
                              {dispatchCategories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>

              <div className="flex gap-2.5 pt-6 mt-6 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setHarvestingItem(null)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={submitHarvest}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold uppercase tracking-wider shadow-sm hover:shadow transition-colors cursor-pointer"
                >
                  Registrar Colheita
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Catalog Add/Edit Modal */}
      <AnimatePresence>
        {isAddingCatalogItem && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Sprout className="text-emerald-600" size={18} />
                  {editingCatalogItemId ? 'Editar Produto do Catálogo' : 'Cadastrar Novo Produto de Cultivo'}
                </h3>
                <button 
                  onClick={() => setIsAddingCatalogItem(false)}
                  className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAddOrUpdateCatalogItem} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1">
                    Nome do Cultivo / Produto
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Alface Americana Orgânica, Cenoura Baby"
                    value={catalogName}
                    onChange={(e) => setCatalogName(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1">
                      Categoria do Alimento
                    </label>
                    <select
                      value={catalogCategory}
                      onChange={(e) => setCatalogCategory(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    >
                      {dispatchCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1">
                      Unidade Padrão
                    </label>
                    <select
                      value={catalogUnit}
                      onChange={(e) => setCatalogUnit(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    >
                      {STANDARD_UNITS.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1">
                      Ciclo de Cultivo (Dias)
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="Ex: 45"
                      value={catalogDays}
                      onChange={(e) => setCatalogDays(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold uppercase text-slate-400 tracking-wider mb-1">
                      Preço de Venda Sugerido (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="5.00"
                      value={catalogPrice}
                      onChange={(e) => setCatalogPrice(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 mt-4">
                  <button
                    type="button"
                    onClick={() => setIsAddingCatalogItem(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wider text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold uppercase tracking-wider shadow-sm transition-colors cursor-pointer"
                  >
                    {editingCatalogItemId ? 'Salvar Alterações' : 'Cadastrar Produto'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Confirmation Dialog */}
      <AnimatePresence>
        {confirmationModal?.isOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-sm w-full p-6 text-center"
            >
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-rose-50 border border-rose-100 text-rose-600 mb-4">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-sm font-black text-slate-900 mb-2">
                {confirmationModal.title}
              </h3>
              <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                {confirmationModal.message}
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmationModal(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer w-full"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmationModal.onConfirm}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer w-full"
                >
                  {confirmationModal.actionLabel}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 9. Extra Quick Gardening Information Callout */}
      <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-xl shrink-0">
            <Info size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800">Dica de Lançamento em Planilha:</h4>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Você pode plantar rapidamente em qualquer canteiro livre clicando no botão verde <strong className="text-slate-700 font-bold">Plantar</strong>. O canteiro correspondente se transformará em campos de inserção direta de dados, agilizando sua rotina sem precisar preencher formulários extensos.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
