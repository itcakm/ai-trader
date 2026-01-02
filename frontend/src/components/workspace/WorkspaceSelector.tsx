'use client';

import React, { useState, useCallback } from 'react';
import { usePreferences } from '@/hooks/usePreferences';
import { Button } from '@/components/ui/Button';
import type { WorkspaceLayout } from '@/types/preferences';

export interface WorkspaceSelectorProps {
  className?: string;
  onWorkspaceChange?: (workspace: WorkspaceLayout | null) => void;
}

export function WorkspaceSelector({
  className = '',
  onWorkspaceChange,
}: WorkspaceSelectorProps) {
  const {
    workspaces,
    activeWorkspace,
    setActiveWorkspace,
    addWorkspace,
    deleteWorkspace,
    syncStatus,
  } = usePreferences({ autoSync: true });

  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');

  const handleWorkspaceSelect = useCallback(
    (workspaceId: string) => {
      setActiveWorkspace(workspaceId);
      const workspace = workspaces.find((ws) => ws.id === workspaceId) || null;
      onWorkspaceChange?.(workspace);
      setIsOpen(false);
    },
    [setActiveWorkspace, workspaces, onWorkspaceChange]
  );

  const handleCreateWorkspace = useCallback(() => {
    if (!newWorkspaceName.trim()) return;

    const id = addWorkspace({
      name: newWorkspaceName.trim(),
      widgets: [],
    });

    const newWorkspace = workspaces.find((ws) => ws.id === id) || null;
    onWorkspaceChange?.(newWorkspace);
    setNewWorkspaceName('');
    setIsCreating(false);
    setIsOpen(false);
  }, [newWorkspaceName, addWorkspace, workspaces, onWorkspaceChange]);

  const handleDeleteWorkspace = useCallback(
    (e: React.MouseEvent, workspaceId: string) => {
      e.stopPropagation();
      if (confirm('Are you sure you want to delete this workspace?')) {
        deleteWorkspace(workspaceId);
      }
    },
    [deleteWorkspace]
  );

  return (
    <div className={`relative ${className}`}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="min-w-[160px] justify-between"
      >
        <span className="truncate">
          {activeWorkspace?.name || 'Select Workspace'}
        </span>
        <svg
          className={`ml-2 h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </Button>

      {isOpen && (
        <div
          className="absolute top-full left-0 mt-1 w-64 bg-card border border-border rounded-md shadow-lg z-50"
          role="listbox"
        >
          <div className="p-2 border-b border-border">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                Workspaces
              </span>
              {syncStatus === 'syncing' && (
                <span className="text-xs text-muted-foreground">Syncing...</span>
              )}
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto">
            {workspaces.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No workspaces yet
              </div>
            ) : (
              workspaces.map((workspace) => (
                <div
                  key={workspace.id}
                  role="option"
                  aria-selected={workspace.id === activeWorkspace?.id}
                  className={`
                    flex items-center justify-between px-3 py-2 cursor-pointer
                    hover:bg-muted transition-colors
                    ${workspace.id === activeWorkspace?.id ? 'bg-muted' : ''}
                  `}
                  onClick={() => handleWorkspaceSelect(workspace.id)}
                >
                  <span className="text-sm truncate">{workspace.name}</span>
                  <button
                    onClick={(e) => handleDeleteWorkspace(e, workspace.id)}
                    className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                    aria-label={`Delete ${workspace.name}`}
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="p-2 border-t border-border">
            {isCreating ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder="Workspace name"
                  className="flex-1 px-2 py-1 text-sm border border-input rounded bg-background"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateWorkspace();
                    if (e.key === 'Escape') {
                      setIsCreating(false);
                      setNewWorkspaceName('');
                    }
                  }}
                />
                <Button size="sm" onClick={handleCreateWorkspace}>
                  Add
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => setIsCreating(true)}
              >
                <svg
                  className="mr-2 h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                New Workspace
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
