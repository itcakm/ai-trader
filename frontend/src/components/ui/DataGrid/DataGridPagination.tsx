'use client';

import React from 'react';
import type { PaginationState } from './types';

interface DataGridPaginationProps {
  pagination: PaginationState;
  pageSizes: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function DataGridPagination({
  pagination,
  pageSizes,
  onPageChange,
  onPageSizeChange,
}: DataGridPaginationProps) {
  const { page, pageSize, totalRows, totalPages } = pagination;

  const startRow = page * pageSize + 1;
  const endRow = Math.min((page + 1) * pageSize, totalRows);

  const canGoPrevious = page > 0;
  const canGoNext = page < totalPages - 1;

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      // Show all pages
      for (let i = 0; i < totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(0);

      if (page > 2) {
        pages.push('ellipsis');
      }

      // Show pages around current
      const start = Math.max(1, page - 1);
      const end = Math.min(totalPages - 2, page + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (page < totalPages - 3) {
        pages.push('ellipsis');
      }

      // Always show last page
      pages.push(totalPages - 1);
    }

    return pages;
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
      {/* Row count info */}
      <div className="text-sm text-muted-foreground">
        {totalRows > 0 ? (
          <>
            Showing <span className="font-medium text-foreground">{startRow}</span> to{' '}
            <span className="font-medium text-foreground">{endRow}</span> of{' '}
            <span className="font-medium text-foreground">{totalRows}</span> results
          </>
        ) : (
          'No results'
        )}
      </div>

      {/* Pagination controls */}
      <div className="flex items-center gap-4">
        {/* Page size selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="page-size" className="text-sm text-muted-foreground">
            Rows per page:
          </label>
          <select
            id="page-size"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="
              px-2 py-1 text-sm rounded-md
              bg-background border border-input
              text-foreground
              focus:outline-none focus:ring-2 focus:ring-primary-500
            "
          >
            {pageSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        {/* Page navigation */}
        <nav className="flex items-center gap-1" aria-label="Pagination">
          {/* First page */}
          <button
            onClick={() => onPageChange(0)}
            disabled={!canGoPrevious}
            className="
              p-1.5 rounded-md
              text-muted-foreground hover:text-foreground hover:bg-muted
              disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent
            "
            aria-label="Go to first page"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>

          {/* Previous page */}
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={!canGoPrevious}
            className="
              p-1.5 rounded-md
              text-muted-foreground hover:text-foreground hover:bg-muted
              disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent
            "
            aria-label="Go to previous page"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Page numbers */}
          {getPageNumbers().map((pageNum, index) => {
            if (pageNum === 'ellipsis') {
              return (
                <span
                  key={`ellipsis-${index}`}
                  className="px-2 text-muted-foreground"
                >
                  …
                </span>
              );
            }

            const isCurrentPage = pageNum === page;

            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`
                  min-w-[32px] h-8 px-2 rounded-md text-sm font-medium
                  ${
                    isCurrentPage
                      ? 'bg-primary-600 text-white'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }
                `}
                aria-label={`Go to page ${pageNum + 1}`}
                aria-current={isCurrentPage ? 'page' : undefined}
              >
                {pageNum + 1}
              </button>
            );
          })}

          {/* Next page */}
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={!canGoNext}
            className="
              p-1.5 rounded-md
              text-muted-foreground hover:text-foreground hover:bg-muted
              disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent
            "
            aria-label="Go to next page"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Last page */}
          <button
            onClick={() => onPageChange(totalPages - 1)}
            disabled={!canGoNext}
            className="
              p-1.5 rounded-md
              text-muted-foreground hover:text-foreground hover:bg-muted
              disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent
            "
            aria-label="Go to last page"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        </nav>
      </div>
    </div>
  );
}
