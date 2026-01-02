'use client';

import React, { useState, useCallback } from 'react';
import { usePreferences } from '@/hooks/usePreferences';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import type { WorkspaceLayout, WorkspaceWidget } from '@/types/preferences';

export interface WorkspaceManagerProps {
  className?: string;
  onSave?: (workspace: WorkspaceLayout) => void;
}

export function WorkspaceManager({ className = '', onSave }: WorkspaceManagerProps) {
  const {
    workspaces,
    activeWorkspace,
    addWorkspace,
    updateWorkspace,
    deleteWorkspace,
    setActiveWorkspace,
    syncPreferences,
    syncStatus,
  } = usePreferences({ autoSync: false });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const handleStartEdit = useCallback((workspace: WorkspaceLayout) => {
    setEditingId(workspace.id);
    setEditName(workspace.name);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingId || !editName.trim()) return;

    updateWorkspace(editingId, { name: editName.trim() });
    setEditingId(null);
    setEditName('');
  }, [editingId, editName, updateWorkspace]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditName('');
  }, []);

  const handleCreate = useCallback(() => {
    if (!newName.trim()) return;

    const id = addWorkspace({
      name: newName.trim(),
      widgets: [],
    });

    setNewName('');
    setIsCreating(false);
    setActiveWorkspace(id);
  }, [newName, addWorkspace, setActiveWorkspace]);

  const handleDelete = useCallback(
    (workspaceId: string) => {
      if (confirm('Are you sure you want to delete this workspace?')) {
        deleteWorkspace(workspaceId);
      }
    },
    [deleteWorkspace]
  );

  const handleSync = useCallback(async () => {
    try {
      await syncPreferences();
    } catch (error) {
      console.error('Failed to sync preferences:', error);
    }
  }, [syncPreferences]);

  const handleSaveWorkspace = useCallback(
    (workspace: WorkspaceLayout) => {
      onSave?.(workspace);
    },
    [onSave]
  );

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Workspace Management</CardTitle>
          <div className="flex items-center gap-2">
            {syncStatus === 'syncing' && (
              <span className="text-sm text-muted-foreground">Syncing...</span>
            )}
            {syncStatus === 'error' && (
              <span className="text-sm text-red-500">Sync failed</span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              loading={syncStatus === 'syncing'}
            >
              Sync
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {workspaces.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No workspaces created yet. Create your first workspace to get started.
            </p>
          ) : (
            <div className="space-y-2">
              {workspaces.map((workspace) => (
                <div
                  key={workspace.id}
                  className={`
                    flex items-center justify-between p-3 rounded-md border
                    ${workspace.id === activeWorkspace?.id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-border hover:bg-muted/50'
                    }
                  `}
                >
                  {editingId === workspace.id ? (
                    <div className="flex-1 flex items-center gap-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit();
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                      />
                      <Button size="sm" onClick={handleSaveEdit}>
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCancelEdit}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div
                        className="flex-1 cursor-pointer"
                        onClick={() => setActiveWorkspace(workspace.id)}
                      >
                        <div className="font-medium">{workspace.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {workspace.widgets.length} widgets • Updated{' '}
                          {new Date(workspace.updatedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSaveWorkspace(workspace)}
                          title="Save current layout"
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
                              d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                            />
                          </svg>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStartEdit(workspace)}
                          title="Edit name"
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
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(workspace.id)}
                          title="Delete workspace"
                          className="text-red-500 hover:text-red-600"
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
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter>
        {isCreating ? (
          <div className="flex w-full gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Workspace name"
              className="flex-1"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') {
                  setIsCreating(false);
                  setNewName('');
                }
              }}
            />
            <Button onClick={handleCreate}>Create</Button>
            <Button
              variant="ghost"
              onClick={() => {
                setIsCreating(false);
                setNewName('');
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full"
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
            Create New Workspace
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
