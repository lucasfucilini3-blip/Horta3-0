export type UserRole = 'owner' | 'employee';

export interface UserPermissions {
  canManageInventory: boolean;
  canManageSales: boolean;
  canViewFinance: boolean;
  canViewReports: boolean;
  canManageCustomers: boolean;
  canManageProduction: boolean;
  canManageTasks: boolean;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  permissions: UserPermissions;
}

export type InventoryCategory = string;

export interface Category {
  id: string;
  name: string;
  type: 'inventory' | 'transaction';
}

export interface Customer {
  id: string;
  companyName: string;
  contactName: string;
  phone: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  type: 'input' | 'dispatch'; // Entrada de Insumos vs Expedição
  category: InventoryCategory;
  quantity: number;
  unit: string;
  price?: number; // Preço de venda (apenas para expedição)
  costPrice?: number; // Custo de aquisição ou produção
  minStock: number;
  lastUpdated: any; // Firestore Timestamp
}

export interface LogProduct {
  itemId: string;
  name: string;
  quantity: number;
  unit: string;
  costAtTime?: number; // Custo do insumo no momento do uso
}

export interface ProductionLog {
  date: any;
  description: string;
  products?: LogProduct[];
  packages?: number;
}

export interface Production {
  id: string;
  crop: string; // Cultura
  bed: string; // Canteiro
  plantingDate: any;
  quantityPlanted: number;
  unit: string;
  inputsUsed: string[]; // Insumos do estoque
  productionType?: 'seedling' | 'bed'; // Mudas vs Canteiro
  plantingSource?: 'seeds' | 'internal_seedlings' | 'purchased_seedlings'; // Sementes vs Mudas
  transplantDate?: any;
  estimatedHarvestDate?: any;
  logs: ProductionLog[];
  status: 'growing' | 'harvested' | 'lost';
  isContinuousHarvest?: boolean;
  harvestDate?: any;
  harvestQuantity?: number;
  harvestPackages?: number;
  remainingQuantity?: number;
  totalCost?: number; // Custo total acumulado (insumos + outros)
  unitCost?: number; // Custo por unidade (totalCost / harvestQuantity)
  createdAt: any;
}

export interface ProduceCatalogItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  estimatedDaysToHarvest: number;
  defaultPrice: number;
  createdAt: any;
}

export type SaleStatus = 'ordered' | 'pending_delivery' | 'delivered' | 'paid' | 'cancelled' | 'pending' | 'confirmed';

export interface SaleItem {
  itemId: string;
  productionId?: string | null;
  name: string;
  quantity: number;
  price: number;
  cost?: number; // Custo unitário / de compra no momento da venda
  source?: 'own_production' | 'third_party'; // 'own_production' = Horta Própria, 'third_party' = Compra de Terceiros / Revenda
  unit?: string; // kg, un, pct, cx, etc.
  estimatedCost?: number; // Custo de compra estimado
  purchased?: boolean; // Se o item de terceiros já foi comprado/adquirido
  supplierNotes?: string; // Fornecedor / observação da compra
  originalRequestedQty?: number; // Quantidade solicitada inicialmente pelo cliente
  actualWeightedQty?: number; // Quantidade real após pesagem na balança
}

export interface PaymentMethod {
  method: string;
  amount: number;
}

export interface Sale {
  id: string;
  saleNumber: string;
  customerName: string;
  customerPhone?: string;
  deliveryAddress?: string;
  observations?: string;
  isDelivery?: boolean;
  isKgMode?: boolean; // Modo de entrega/venda por KG & Revenda mista
  thirdPartyPurchased?: boolean; // Se todas as compras de terceiros foram efetuadas
  totalCost?: number; // Custo total (compras de terceiros + custo de produção)
  estimatedProfit?: number; // Lucro bruto previsto
  profitMargin?: number; // Margem de lucro (%)
  supplierExpenseRecorded?: boolean; // Se a despesa de compra de terceiros já foi lançada no financeiro
  items: SaleItem[];
  total: number;
  status: SaleStatus;
  deliveryDate?: any; // Firestore Timestamp
  paymentMethods?: PaymentMethod[];
  createdAt: any; // Firestore Timestamp
  confirmedAt?: any; // Firestore Timestamp
}

export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  description: string;
  category: string;
  date: any; // Firestore Timestamp
  relatedSaleId?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate?: any; // Firestore Timestamp
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
  completedAt?: any; // Firestore Timestamp
  createdAt: any; // Firestore Timestamp
}

export interface BedRecord {
  id: string;
  bedId: string; // ex: "1", "2", "3", "Canteiro A"
  date: any; // data do registro (Timestamp)
  crop: string; // cultura
  activityType: 'planting' | 'treatment' | 'fertilization' | 'harvest' | 'general';
  
  // Detalhes dependendo da atividade registrada
  treatmentDescription?: string; // Tratamento realizado
  fertilizerDescription?: string; // Adubação realizada
  harvestQuantity?: number; // Quantidade colhida
  harvestUnit?: string; // Unidade da colheita (kg, mç, un, etc)
  harvestPackages?: number; // Quantidade de pacotes da colheita
  quantityPlanted?: number; // Quantidade plantada
  unitPlanted?: string; // Unidade do plantio (mudas, sementes, etc)
  
  employeeName?: string; // Responsável
  notes?: string; // Observações adicionais
  syncedToProduction?: boolean; // Se integrou com a tabela de produção/estoque
  productionId?: string; // Se tem vínculo direto com a produção
  createdAt: any; // Timestamp do sistema
}

export interface SeedingLog {
  date: any; // Firestore Timestamp
  description: string;
  products?: string[];
}

export interface NurserySeedling {
  id: string;
  crop: string;
  plantingDate: any; // Firestore Timestamp
  trayCount: number;
  cellCount: number;
  totalCells: number;
  status: 'nursery' | 'transplanted' | 'lost';
  transplantDate?: any; // Firestore Timestamp
  transplantedQty?: number;
  transplantedBed?: string;
  notes?: string;
  logs?: SeedingLog[];
  createdAt: any; // Firestore Timestamp
}

export type PurchasePaymentStatus = 'paid' | 'pending';

export interface ThirdPartyPurchaseItem {
  id?: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
}

export interface ThirdPartyPurchase {
  id: string;
  purchaseNumber?: string;
  supplierName: string;
  purchaseDate: any; // Firestore Timestamp
  dueDate?: any; // Firestore Timestamp (Vencimento quando a pagar)
  paymentDate?: any; // Firestore Timestamp (Data da efetivação do pagamento)
  items: ThirdPartyPurchaseItem[];
  totalAmount: number;
  paymentStatus: PurchasePaymentStatus; // 'paid' | 'pending'
  paymentMethod?: string; // Pix, Dinheiro, Boleto, Cartão, A Prazo
  notes?: string;
  financialExpenseId?: string;
  createdAt: any;
  updatedAt?: any;
}

export interface ThirdPartyStockItem {
  name: string;
  canonicalName: string;
  unit: string;
  totalPurchased: number;
  totalSold: number;
  currentStock: number;
  latestCost: number;
  averageCost: number;
  lastSupplier?: string;
  lastPurchaseDate?: any;
  purchaseCount: number;
}

export interface ThirdPartyPreset {
  id: string;
  name: string;
  defaultCost: number;
  defaultPrice: number;
  unit: string;
}

