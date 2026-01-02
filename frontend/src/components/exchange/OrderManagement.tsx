'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import {
  Order,
  OrderStatus,
  OrderSide,
  OrderType,
  ExchangeId,
  orderStatusVariant,
  orderSideVariant,
} from '../../types/exchange';

export interface OrderManagementProps {
  orders: Order[];
  loading?: boolean;
  onRefresh?: () => void;
  onCancelOrder?: (orderId: string) => void;
  onViewOrderDetails?: (order: Order) => void;
  onCreateOrder?: () => void;
}

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'OPEN', label: 'Open' },
  { value: 'PARTIALLY_FILLED', label: 'Partially Filled' },
  { value: 'FILLED', label: 'Filled' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'EXPIRED', label: 'Expired' },
];

const sideOptions = [
  { value: '', label: 'All Sides' },
  { value: 'BUY', label: 'Buy' },
  { value: 'SELL', label: 'Sell' },
];

export function OrderManagement({
  orders,
  loading = false,
  onRefresh,
  onCancelOrder,
  onViewOrderDetails,
  onCreateOrder,
}: OrderManagementProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sideFilter, setSideFilter] = useState('');

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        order.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.assetId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.exchangeId.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = !statusFilter || order.status === statusFilter;
      const matchesSide = !sideFilter || order.side === sideFilter;
      return matchesSearch && matchesStatus && matchesSide;
    });
  }, [orders, searchTerm, statusFilter, sideFilter]);

  const formatPrice = (price?: number) => {
    if (price === undefined) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(price);
  };

  const formatQuantity = (quantity: number) => {
    return quantity.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 8,
    });
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const canCancel = (status: OrderStatus) => {
    return status === 'PENDING' || status === 'OPEN' || status === 'PARTIALLY_FILLED';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Orders</CardTitle>
          <div className="flex items-center gap-2">
            {onCreateOrder && (
              <Button size="sm" onClick={onCreateOrder}>
                New Order
              </Button>
            )}
            {onRefresh && (
              <Button variant="outline" size="sm" onClick={onRefresh} loading={loading}>
                Refresh
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search by ID, asset, or exchange..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-40">
            <Select
              options={statusOptions}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            />
          </div>
          <div className="w-32">
            <Select
              options={sideOptions}
              value={sideFilter}
              onChange={(e) => setSideFilter(e.target.value)}
            />
          </div>
        </div>

        {/* Orders Table */}
        {loading && orders.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {orders.length === 0 ? 'No orders yet.' : 'No orders match your filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Asset</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Side</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Type</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Quantity</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Price</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Filled</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Exchange</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Time</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr
                    key={order.orderId}
                    className="border-b border-border hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => onViewOrderDetails?.(order)}
                  >
                    <td className="py-3 px-4 font-medium text-foreground">{order.assetId}</td>
                    <td className="py-3 px-4">
                      <Badge variant={orderSideVariant[order.side]}>{order.side}</Badge>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{order.orderType}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatQuantity(order.quantity)}</td>
                    <td className="py-3 px-4 text-right font-mono">{formatPrice(order.price)}</td>
                    <td className="py-3 px-4 text-right font-mono">
                      {formatQuantity(order.filledQuantity)} / {formatQuantity(order.quantity)}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={orderStatusVariant[order.status]}>{order.status}</Badge>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{order.exchangeId}</td>
                    <td className="py-3 px-4 text-right text-muted-foreground text-sm">
                      {formatTime(order.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {canCancel(order.status) && onCancelOrder && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCancelOrder(order.orderId);
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
