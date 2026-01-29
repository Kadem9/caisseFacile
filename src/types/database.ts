// ===================================
// Type Definitions - Database Entities
// ===================================

// User roles in the system
export type UserRole = 'admin' | 'manager' | 'cashier';

// Payment methods available
export type PaymentMethod = 'cash' | 'card' | 'mixed';

// Stock movement types
export type StockMovementType = 'in' | 'out' | 'adjustment' | 'sale';

// ===================================
// User Entity
// ===================================
export interface User {
  id: number;
  name: string;
  pinHash: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserCreateInput {
  name: string;
  pin: string;
  role: UserRole;
}

// ===================================
// Category Entity
// ===================================
export interface Category {
  id: number;
  name: string;
  color: string;
  icon?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryCreateInput {
  name: string;
  color: string;
  icon?: string;
  sortOrder?: number;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// ===================================
// Product Entity
// ===================================
export interface Product {
  id: number;
  categoryId: number;
  name: string;
  price: number;
  stockQuantity: number;
  alertThreshold: number;
  isActive: boolean;
  imagePath?: string;
  printTicket?: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductWithCategory extends Product {
  category: Category;
}

export interface ProductCreateInput {
  categoryId: number;
  name: string;
  price: number;
  stockQuantity?: number;
  alertThreshold?: number;
  imagePath?: string;
  printTicket?: boolean;
  sortOrder?: number;
}

// ===================================
// Transaction Entity
// ===================================
export interface Transaction {
  id: number;
  userId: number;
  createdAt: Date;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  cashReceived?: number;
  changeGiven?: number;
  items: TransactionItem[];
  isSynced: boolean;
}

export interface TransactionWithDetails extends Transaction {
  user: User;
  items: TransactionItem[];
}

// ===================================
// Transaction Item Entity
// ===================================
export interface TransactionItem {
  id: number;
  transactionId: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface TransactionItemWithProduct extends TransactionItem {
  product: Product;
}

// ===================================
// Cash Closure Entity
// ===================================
export interface CashClosure {
  id: number;
  userId: number;
  openedAt: string | Date;
  closedAt?: string | Date;
  initialAmount?: number;
  expectedAmount: number;
  actualAmount?: number;
  difference?: number;
  notes?: string;
  isSynced: boolean;
  deviceName?: string;
}

export interface CashClosureWithDetails extends CashClosure {
  user: User;
  transactions: Transaction[];
  movements?: CashMovement[];
}

// ===================================
// Cash Movement Entity (Withdrawals/Deposits)
// ===================================
export type CashMovementType = 'withdrawal' | 'deposit';

export interface CashMovement {
  id: number;
  closureId: number;
  userId: number;
  type: CashMovementType;
  amount: number;
  reason?: string;
  createdAt: string | Date;
  isSynced: boolean;
  deviceName?: string;
}

// ===================================
// Stock Movement Entity
// ===================================
export interface StockMovement {
  id: number;
  productId: number;
  userId: number;
  type: StockMovementType;
  quantity: number;
  reason?: string;
  createdAt: Date;
  isSynced: boolean;
}

export interface StockMovementWithDetails extends StockMovement {
  product: Product;
  user: User;
}

// ===================================
// Menu Entity
// ===================================
export interface MenuComponent {
  id: number;
  menuId: number;
  categoryId: number;
  label: string;
  quantity: number;
  isRequired: boolean;
  allowedProductIds?: number[];
}

export interface Menu {
  id: number;
  name: string;
  description?: string;
  price: number;
  imagePath?: string;
  isActive: boolean;
  components: MenuComponent[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MenuCreateInput {
  name: string;
  description?: string;
  price: number;
  imagePath?: string;
  components: {
    categoryId: number;
    label: string;
    quantity: number;
    isRequired: boolean;
    allowedProductIds: number[];
  }[];
}
