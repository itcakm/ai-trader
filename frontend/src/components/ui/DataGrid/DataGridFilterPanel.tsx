'use client';

import React, { useState } from 'react';
import type { ColumnDef, FilterModel, FilterItem, FilterOperator } from './types';
import { getFilterOperators, getOperatorLabel } from './utils';

interface DataGridFilterPanelProps<T> {
  columns: ColumnDef<T>[];
  filterModel: FilterModel;
  onFilterChange: (filterModel: FilterModel) => void;
  onAddFilter: (filter: FilterItem) => void;
  onRemoveFilter: (index: number) => void;
  onClearFilters: () => void;
}

export function DataGridFilterPanel<T>({
  columns,
  filterModel,
  onFilterChange,
  onAddFilter,
  onRemoveFilter,
  onClearFilters,
}: DataGridFilterPanelProps<T>) {
  const [newFilter, setNewFilter] = useState<Partial<FilterItem>>({});

  // Get filterable columns
  const filterableColumns = columns.filter((col) => col.filterable !== false);

  // Get selected column for new filter
  const selectedColumn = filterableColumns.find((col) => col.id === newFilter.field);
  const filterType = selectedColumn?.filterType || 'text';
  const availableOperators = getFilterOperators(filterType);

  const handleAddFilter = () => {
    if (!newFilter.field || !newFilter.operator) return;

    const filter: FilterItem = {
      field: newFilter.field,
      operator: newFilter.operator as FilterOperator,
      value: newFilter.value ?? '',
      valueTo: newFilter.valueTo,
    };

    onAddFilter(filter);
    setNewFilter({});
  };

  const handleUpdateFilter = (index: number, updates: Partial<FilterItem>) => {
    const newItems = [...filterModel.items];
    newItems[index] = { ...newItems[index], ...updates };
    onFilterChange({ ...filterModel, items: newItems });
  };

  const handleLogicOperatorChange = (operator: 'and' | 'or') => {
    onFilterChange({ ...filterModel, logicOperator: operator });
  };

  return (
    <div className="px-4 py-3 border-b border-border bg-muted/20">
      {/* Active filters */}
      {filterModel.items.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-foreground">Active Filters</span>
            <div className="flex items-center gap-1 text-sm">
              <button
                onClick={() => handleLogicOperatorChange('and')}
                className={`px-2 py-0.5 rounded ${
                  filterModel.logicOperator === 'and'
                    ? 'bg-primary-600 text-white'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                AND
              </button>
              <button
                onClick={() => handleLogicOperatorChange('or')}
                className={`px-2 py-0.5 rounded ${
                  filterModel.logicOperator === 'or'
                    ? 'bg-primary-600 text-white'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                OR
              </button>
            </div>
            <button
              onClick={onClearFilters}
              className="ml-auto text-sm text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {filterModel.items.map((filter, index) => {
              const column = columns.find((col) => col.id === filter.field);
              return (
                <div
                  key={index}
                  className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md text-sm"
                >
                  <span className="font-medium">{column?.header || filter.field}</span>
                  <span className="text-muted-foreground">{getOperatorLabel(filter.operator)}</span>
                  <span className="text-foreground">
                    {filter.operator === 'between'
                      ? `${filter.value} - ${filter.valueTo}`
                      : filter.operator === 'isEmpty' || filter.operator === 'isNotEmpty'
                      ? ''
                      : String(filter.value)}
                  </span>
                  <button
                    onClick={() => onRemoveFilter(index)}
                    className="ml-1 text-muted-foreground hover:text-foreground"
                    aria-label={`Remove filter for ${column?.header}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add new filter */}
      <div className="flex items-end gap-3">
        {/* Column selector */}
        <div className="flex-1 max-w-[200px]">
          <label className="block text-xs text-muted-foreground mb-1">Column</label>
          <select
            value={newFilter.field || ''}
            onChange={(e) => setNewFilter({ field: e.target.value, operator: undefined, value: undefined })}
            className="
              w-full px-3 py-1.5 text-sm rounded-md
              bg-background border border-input
              text-foreground
              focus:outline-none focus:ring-2 focus:ring-primary-500
            "
          >
            <option value="">Select column...</option>
            {filterableColumns.map((col) => (
              <option key={col.id} value={col.id}>
                {col.header}
              </option>
            ))}
          </select>
        </div>

        {/* Operator selector */}
        {newFilter.field && (
          <div className="flex-1 max-w-[180px]">
            <label className="block text-xs text-muted-foreground mb-1">Operator</label>
            <select
              value={newFilter.operator || ''}
              onChange={(e) => setNewFilter({ ...newFilter, operator: e.target.value as FilterOperator })}
              className="
                w-full px-3 py-1.5 text-sm rounded-md
                bg-background border border-input
                text-foreground
                focus:outline-none focus:ring-2 focus:ring-primary-500
              "
            >
              <option value="">Select operator...</option>
              {availableOperators.map((op) => (
                <option key={op} value={op}>
                  {getOperatorLabel(op)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Value input */}
        {newFilter.field && newFilter.operator && !['isEmpty', 'isNotEmpty'].includes(newFilter.operator) && (
          <>
            <div className="flex-1 max-w-[200px]">
              <label className="block text-xs text-muted-foreground mb-1">Value</label>
              {filterType === 'select' && selectedColumn?.filterOptions ? (
                <select
                  value={String(newFilter.value || '')}
                  onChange={(e) => setNewFilter({ ...newFilter, value: e.target.value })}
                  className="
                    w-full px-3 py-1.5 text-sm rounded-md
                    bg-background border border-input
                    text-foreground
                    focus:outline-none focus:ring-2 focus:ring-primary-500
                  "
                >
                  <option value="">Select value...</option>
                  {selectedColumn.filterOptions.map((opt) => (
                    <option key={String(opt.value)} value={String(opt.value)}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : filterType === 'date' ? (
                <input
                  type="date"
                  value={String(newFilter.value || '')}
                  onChange={(e) => setNewFilter({ ...newFilter, value: e.target.value })}
                  className="
                    w-full px-3 py-1.5 text-sm rounded-md
                    bg-background border border-input
                    text-foreground
                    focus:outline-none focus:ring-2 focus:ring-primary-500
                  "
                />
              ) : filterType === 'number' ? (
                <input
                  type="number"
                  value={String(newFilter.value || '')}
                  onChange={(e) => setNewFilter({ ...newFilter, value: e.target.valueAsNumber || e.target.value })}
                  placeholder="Enter value..."
                  className="
                    w-full px-3 py-1.5 text-sm rounded-md
                    bg-background border border-input
                    text-foreground placeholder:text-muted-foreground
                    focus:outline-none focus:ring-2 focus:ring-primary-500
                  "
                />
              ) : (
                <input
                  type="text"
                  value={String(newFilter.value || '')}
                  onChange={(e) => setNewFilter({ ...newFilter, value: e.target.value })}
                  placeholder="Enter value..."
                  className="
                    w-full px-3 py-1.5 text-sm rounded-md
                    bg-background border border-input
                    text-foreground placeholder:text-muted-foreground
                    focus:outline-none focus:ring-2 focus:ring-primary-500
                  "
                />
              )}
            </div>

            {/* Second value for 'between' operator */}
            {newFilter.operator === 'between' && (
              <div className="flex-1 max-w-[200px]">
                <label className="block text-xs text-muted-foreground mb-1">To</label>
                {filterType === 'date' ? (
                  <input
                    type="date"
                    value={String(newFilter.valueTo || '')}
                    onChange={(e) => setNewFilter({ ...newFilter, valueTo: e.target.value })}
                    className="
                      w-full px-3 py-1.5 text-sm rounded-md
                      bg-background border border-input
                      text-foreground
                      focus:outline-none focus:ring-2 focus:ring-primary-500
                    "
                  />
                ) : (
                  <input
                    type="number"
                    value={String(newFilter.valueTo || '')}
                    onChange={(e) => setNewFilter({ ...newFilter, valueTo: e.target.valueAsNumber || e.target.value })}
                    placeholder="Enter value..."
                    className="
                      w-full px-3 py-1.5 text-sm rounded-md
                      bg-background border border-input
                      text-foreground placeholder:text-muted-foreground
                      focus:outline-none focus:ring-2 focus:ring-primary-500
                    "
                  />
                )}
              </div>
            )}
          </>
        )}

        {/* Add button */}
        <button
          onClick={handleAddFilter}
          disabled={!newFilter.field || !newFilter.operator}
          className="
            px-4 py-1.5 text-sm font-medium rounded-md
            bg-primary-600 text-white hover:bg-primary-700
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          Add Filter
        </button>
      </div>
    </div>
  );
}
