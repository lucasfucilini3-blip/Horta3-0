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
  remainingQuantity?: number;
  totalCost?: number; // Custo total acumulado (insumos + outros)
  unitCost?: number; // Custo por unidade (totalCost / harvestQuantity)
  createdAt: any;
}

export type SaleStatus = 'ordered' | 'pending_delivery' | 'delivered' | 'paid' | 'cancelled' | 'pending' | 'confirmed';

export interface SaleItem {
  itemId: string;
  productionId?: string | null;
  name: string;
  quantity: number;
  price: number;
  cost?: number; // Custo unitário no momento da venda
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
  quantityPlanted?: number; // Quantidade plantada
  unitPlanted?: string; // Unidade do plantio (mudas, sementes, etc)
  
  employeeName?: string; // Responsável
  notes?: string; // Observações adicionais
  syncedToProduction?: boolean; // Se integrou com a tabela de produção/estoque
  productionId?: string; // Se tem vínculo direto com a produção
  createdAt: any; // Timestamp do sistema
}

