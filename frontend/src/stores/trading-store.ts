/**
 * Trading Store - Zustand store for managing trading data
 * Provides persistent local storage for strategies, positions, orders, and deposits
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Types
export interface Strategy {
  id: string;
  name: string;
  type: 'Momentum' | 'Mean Reversion' | 'Arbitrage' | 'Grid Trading' | 'DCA' | 'Custom';
  description: string;
  status: 'draft' | 'active' | 'paused' | 'stopped';
  pairs: string[];
  parameters: Record<string, number | string | boolean>;
  createdAt: string;
  updatedAt: string;
  totalReturn: number;
  totalTrades: number;
  winRate: number;
}

export interface Position {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  amount: number;
  entryPrice: number;
  currentPrice: number;
  strategyId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  pair: string;
  type: 'MARKET' | 'LIMIT' | 'STOP_LIMIT' | 'STOP_MARKET';
  side: 'BUY' | 'SELL';
  price: number | null;
  amount: number;
  filled: number;
  status: 'PENDING' | 'OPEN' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  strategyId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Deposit {
  id: string;
  amount: number;
  currency: string;
  type: 'deposit' | 'withdrawal';
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
}

export interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  source: string;
  timestamp: string;
  acknowledged: boolean;
}

export interface Activity {
  id: string;
  type: 'trade' | 'strategy' | 'alert' | 'deposit' | 'withdrawal' | 'system';
  actor: string;
  action: string;
  target: string;
  details?: string;
  timestamp: string;
}

interface TradingState {
  // Data
  strategies: Strategy[];
  positions: Position[];
  orders: Order[];
  deposits: Deposit[];
  alerts: Alert[];
  activities: Activity[];
  
  // Computed values cache
  portfolioValue: number;
  totalDeposited: number;
  
  // Strategy actions
  addStrategy: (strategy: Omit<Strategy, 'id' | 'createdAt' | 'updatedAt' | 'totalReturn' | 'totalTrades' | 'winRate'>) => Strategy;
  updateStrategy: (id: string, updates: Partial<Strategy>) => void;
  deleteStrategy: (id: string) => void;
  toggleStrategyStatus: (id: string) => void;
  
  // Position actions
  openPosition: (position: Omit<Position, 'id' | 'createdAt' | 'updatedAt' | 'currentPrice'>) => Position;
  closePosition: (id: string) => void;
  updatePositionPrice: (id: string, price: number) => void;
  
  // Order actions
  createOrder: (order: Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'filled' | 'status'>) => Order;
  cancelOrder: (id: string) => void;
  fillOrder: (id: string, filledAmount?: number) => void;
  
  // Deposit actions
  addDeposit: (amount: number, currency?: string) => Deposit;
  addWithdrawal: (amount: number, currency?: string) => Deposit;
  
  // Alert actions
  addAlert: (alert: Omit<Alert, 'id' | 'timestamp' | 'acknowledged'>) => void;
  acknowledgeAlert: (id: string) => void;
  clearAlerts: () => void;
  
  // Activity actions
  addActivity: (activity: Omit<Activity, 'id' | 'timestamp'>) => void;
  
  // Utility
  recalculatePortfolio: () => void;
  resetAllData: () => void;
}

const generateId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Simulated crypto prices (in production, these would come from an API)
const CRYPTO_PRICES: Record<string, number> = {
  BTC: 43500,
  ETH: 2650,
  SOL: 98,
  AVAX: 38,
  MATIC: 0.92,
  DOT: 7.5,
  LINK: 15.2,
  UNI: 6.8,
  AAVE: 95,
  ADA: 0.52,
};

export const useTradingStore = create<TradingState>()(
  persist(
    (set, get) => ({
      // Initial state
      strategies: [],
      positions: [],
      orders: [],
      deposits: [],
      alerts: [],
      activities: [],
      portfolioValue: 0,
      totalDeposited: 0,

      // Strategy actions
      addStrategy: (strategyData) => {
        const strategy: Strategy = {
          ...strategyData,
          id: generateId('strat'),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          totalReturn: 0,
          totalTrades: 0,
          winRate: 0,
        };
        
        set((state) => ({
          strategies: [...state.strategies, strategy],
        }));
        
        get().addActivity({
          type: 'strategy',
          actor: 'User',
          action: 'created',
          target: strategy.name,
          details: `New ${strategy.type} strategy`,
        });
        
        return strategy;
      },

      updateStrategy: (id, updates) => {
        set((state) => ({
          strategies: state.strategies.map((s) =>
            s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s
          ),
        }));
      },

      deleteStrategy: (id) => {
        const strategy = get().strategies.find((s) => s.id === id);
        set((state) => ({
          strategies: state.strategies.filter((s) => s.id !== id),
        }));
        if (strategy) {
          get().addActivity({
            type: 'strategy',
            actor: 'User',
            action: 'deleted',
            target: strategy.name,
          });
        }
      },

      toggleStrategyStatus: (id) => {
        const strategy = get().strategies.find((s) => s.id === id);
        if (!strategy) return;
        
        const newStatus = strategy.status === 'active' ? 'paused' : 'active';
        get().updateStrategy(id, { status: newStatus });
        
        get().addActivity({
          type: 'strategy',
          actor: 'User',
          action: newStatus === 'active' ? 'activated' : 'paused',
          target: strategy.name,
        });
      },

      // Position actions
      openPosition: (positionData) => {
        const currentPrice = CRYPTO_PRICES[positionData.symbol] || positionData.entryPrice;
        const position: Position = {
          ...positionData,
          id: generateId('pos'),
          currentPrice,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        set((state) => ({
          positions: [...state.positions, position],
        }));
        
        get().addActivity({
          type: 'trade',
          actor: 'User',
          action: 'opened',
          target: `${position.symbol} ${position.side}`,
          details: `${position.amount} @ $${position.entryPrice.toLocaleString()}`,
        });
        
        get().recalculatePortfolio();
        return position;
      },

      closePosition: (id) => {
        const position = get().positions.find((p) => p.id === id);
        if (!position) return;
        
        const pnl = position.side === 'LONG'
          ? (position.currentPrice - position.entryPrice) * position.amount
          : (position.entryPrice - position.currentPrice) * position.amount;
        
        set((state) => ({
          positions: state.positions.filter((p) => p.id !== id),
        }));
        
        get().addActivity({
          type: 'trade',
          actor: 'User',
          action: 'closed',
          target: `${position.symbol} ${position.side}`,
          details: `P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
        });
        
        get().recalculatePortfolio();
      },

      updatePositionPrice: (id, price) => {
        set((state) => ({
          positions: state.positions.map((p) =>
            p.id === id ? { ...p, currentPrice: price, updatedAt: new Date().toISOString() } : p
          ),
        }));
        get().recalculatePortfolio();
      },

      // Order actions
      createOrder: (orderData) => {
        const order: Order = {
          ...orderData,
          id: generateId('ord'),
          filled: 0,
          status: orderData.type === 'MARKET' ? 'FILLED' : 'OPEN',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        // If market order, fill immediately
        if (order.type === 'MARKET') {
          order.filled = order.amount;
        }
        
        set((state) => ({
          orders: [order, ...state.orders],
        }));
        
        get().addActivity({
          type: 'trade',
          actor: 'User',
          action: order.type === 'MARKET' ? 'executed' : 'placed',
          target: order.pair,
          details: `${order.side} ${order.amount} @ ${order.price ? `$${order.price}` : 'Market'}`,
        });
        
        return order;
      },

      cancelOrder: (id) => {
        const order = get().orders.find((o) => o.id === id);
        if (!order || order.status === 'FILLED' || order.status === 'CANCELLED') return;
        
        set((state) => ({
          orders: state.orders.map((o) =>
            o.id === id ? { ...o, status: 'CANCELLED', updatedAt: new Date().toISOString() } : o
          ),
        }));
        
        get().addActivity({
          type: 'trade',
          actor: 'User',
          action: 'cancelled',
          target: order.pair,
          details: `${order.side} order`,
        });
      },

      fillOrder: (id, filledAmount) => {
        set((state) => ({
          orders: state.orders.map((o) => {
            if (o.id !== id) return o;
            const newFilled = filledAmount ?? o.amount;
            return {
              ...o,
              filled: newFilled,
              status: newFilled >= o.amount ? 'FILLED' : 'OPEN',
              updatedAt: new Date().toISOString(),
            };
          }),
        }));
      },

      // Deposit actions
      addDeposit: (amount, currency = 'USD') => {
        const deposit: Deposit = {
          id: generateId('dep'),
          amount,
          currency,
          type: 'deposit',
          status: 'completed',
          createdAt: new Date().toISOString(),
        };
        
        set((state) => ({
          deposits: [deposit, ...state.deposits],
          totalDeposited: state.totalDeposited + amount,
        }));
        
        get().addActivity({
          type: 'deposit',
          actor: 'User',
          action: 'deposited',
          target: `$${amount.toLocaleString()}`,
          details: currency,
        });
        
        get().recalculatePortfolio();
        return deposit;
      },

      addWithdrawal: (amount, currency = 'USD') => {
        const withdrawal: Deposit = {
          id: generateId('wth'),
          amount,
          currency,
          type: 'withdrawal',
          status: 'completed',
          createdAt: new Date().toISOString(),
        };
        
        set((state) => ({
          deposits: [withdrawal, ...state.deposits],
          totalDeposited: state.totalDeposited - amount,
        }));
        
        get().addActivity({
          type: 'withdrawal',
          actor: 'User',
          action: 'withdrew',
          target: `$${amount.toLocaleString()}`,
          details: currency,
        });
        
        get().recalculatePortfolio();
        return withdrawal;
      },

      // Alert actions
      addAlert: (alertData) => {
        const alert: Alert = {
          ...alertData,
          id: generateId('alert'),
          timestamp: new Date().toISOString(),
          acknowledged: false,
        };
        
        set((state) => ({
          alerts: [alert, ...state.alerts].slice(0, 50), // Keep last 50 alerts
        }));
      },

      acknowledgeAlert: (id) => {
        set((state) => ({
          alerts: state.alerts.map((a) =>
            a.id === id ? { ...a, acknowledged: true } : a
          ),
        }));
      },

      clearAlerts: () => {
        set({ alerts: [] });
      },

      // Activity actions
      addActivity: (activityData) => {
        const activity: Activity = {
          ...activityData,
          id: generateId('act'),
          timestamp: new Date().toISOString(),
        };
        
        set((state) => ({
          activities: [activity, ...state.activities].slice(0, 100), // Keep last 100 activities
        }));
      },

      // Utility
      recalculatePortfolio: () => {
        const state = get();
        
        // Calculate total position value
        const positionValue = state.positions.reduce((sum, pos) => {
          return sum + pos.currentPrice * pos.amount;
        }, 0);
        
        // Calculate cash (deposits - withdrawals - position costs)
        const totalCash = state.deposits.reduce((sum, d) => {
          return d.type === 'deposit' ? sum + d.amount : sum - d.amount;
        }, 0);
        
        const positionCost = state.positions.reduce((sum, pos) => {
          return sum + pos.entryPrice * pos.amount;
        }, 0);
        
        const availableCash = totalCash - positionCost;
        const portfolioValue = positionValue + Math.max(0, availableCash);
        
        set({ portfolioValue });
      },

      resetAllData: () => {
        set({
          strategies: [],
          positions: [],
          orders: [],
          deposits: [],
          alerts: [],
          activities: [],
          portfolioValue: 0,
          totalDeposited: 0,
        });
      },
    }),
    {
      name: 'trading-store',
      version: 1,
    }
  )
);

// Selectors for computed values
export const selectActiveStrategies = (state: TradingState) =>
  state.strategies.filter((s) => s.status === 'active');

export const selectOpenPositions = (state: TradingState) => state.positions;

export const selectOpenOrders = (state: TradingState) =>
  state.orders.filter((o) => o.status === 'OPEN' || o.status === 'PENDING');

export const selectUnacknowledgedAlerts = (state: TradingState) =>
  state.alerts.filter((a) => !a.acknowledged);

export const selectTotalPnL = (state: TradingState) => {
  return state.positions.reduce((sum, pos) => {
    const pnl = pos.side === 'LONG'
      ? (pos.currentPrice - pos.entryPrice) * pos.amount
      : (pos.entryPrice - pos.currentPrice) * pos.amount;
    return sum + pnl;
  }, 0);
};

export const selectWinRate = (state: TradingState) => {
  const filledOrders = state.orders.filter((o) => o.status === 'FILLED');
  if (filledOrders.length === 0) return 0;
  // Simplified win rate calculation
  return Math.min(100, 50 + state.strategies.filter((s) => s.status === 'active').length * 5);
};
