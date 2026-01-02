'use client';

import React, { useState } from 'react';
import type { BatchAction, ExportFormat } from './types';

interface DataGridToolbarProps<T> {
  filterable: boolean;
  filterCount: number;
  onToggleFilters: () => void;
  selectable: boolean;
  selectedCount: number;
  batchActions: BatchAction<T>[];
  selectedRows: T[];
  exportFormats: ExportFormat[];
  onExport: (format: ExportFormat) => void;
  onClearSelection: () => void;
}

export function DataGridToolbar<T>({
  filterable,
  filterCount,
  onToggleFilters,
  selectable,
  selectedCount,
  batchActions,
  selectedRows,
  exportFormats,
  onExport,
  onClearSelection,
}: DataGridToolbarProps<T>) {
  const [confirmAction, setConfirmAction] = useState<BatchAction<T> | null>(null);
  const [executing, setExecuting] = useState(false);

  const handleBatchAction = async (action: BatchAction<T>) => {
    if (action.confirmMessage) {
      setConfirmAction(action);
      return;
    }

    await executeBatchAction(action);
  };

  const executeBatchAction = async (action: BatchAction<T>) => {
    setExecuting(true);
    try {
      await action.onExecute(selectedRows);
      onClearSelection();
    } finally {
      setExecuting(false);
      setConfirmAction(null);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          {/* Filter toggle */}
          {filterable && (
            <button
              onClick={onToggleFilters}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded-md text-sm
                ${filterCount > 0 ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' : 'hover:bg-muted text-muted-foreground hover:text-foreground'}
              `}
            >
              <FilterIcon />
              <span>Filters</span>
              {filterCount > 0 && (
                <span className="px-1.5 py-0.5 text-xs font-medium bg-primary-600 text-white rounded-full">
                  {filterCount}
                </span>
              )}
            </button>
          )}

          {/* Selection info and batch actions */}
          {selectable && selectedCount > 0 && (
            <div className="flex items-center gap-3 pl-3 border-l border-border">
              <span className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{selectedCount}</span> selected
              </span>

              {/* Batch action buttons */}
              {batchActions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => handleBatchAction(action)}
                  disabled={action.disabled || executing}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium
                    ${
                      action.destructive
                        ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                        : 'text-foreground hover:bg-muted'
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed
                  `}
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}

              {/* Clear selection */}
              <button
                onClick={onClearSelection}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>

        {/* Export buttons */}
        {exportFormats.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Export:</span>
            {exportFormats.map((format) => (
              <button
                key={format}
                onClick={() => onExport(format)}
                className="
                  px-2 py-1 text-sm rounded-md
                  text-muted-foreground hover:text-foreground hover:bg-muted
                "
              >
                {format.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Confirm Action
            </h3>
            <p className="text-muted-foreground mb-4">
              {confirmAction.confirmMessage}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                disabled={executing}
                className="px-4 py-2 text-sm font-medium rounded-md hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => executeBatchAction(confirmAction)}
                disabled={executing}
                className={`
                  px-4 py-2 text-sm font-medium rounded-md text-white
                  ${confirmAction.destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-600 hover:bg-primary-700'}
                  disabled:opacity-50
                `}
              >
                {executing ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FilterIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
      />
    </svg>
  );
}
