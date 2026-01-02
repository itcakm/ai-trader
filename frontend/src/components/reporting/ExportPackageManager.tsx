'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { AuditPackage, AuditPackageScope, ExportFormat } from '../../types/reporting';

export interface ExportPackageManagerProps {
  packages: AuditPackage[];
  loading?: boolean;
  onGeneratePackage: (scope: AuditPackageScope, format: ExportFormat) => void;
  onDownloadPackage?: (packageId: string) => void;
  onVerifyIntegrity?: (packageId: string) => void;
}

const formatOptions = [
  { value: 'JSON', label: 'JSON' },
  { value: 'CSV', label: 'CSV' },
  { value: 'PDF', label: 'PDF' },
];

export function ExportPackageManager({
  packages,
  loading = false,
  onGeneratePackage,
  onDownloadPackage,
  onVerifyIntegrity,
}: ExportPackageManagerProps) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [strategyIds, setStrategyIds] = useState('');
  const [assetIds, setAssetIds] = useState('');
  const [format, setFormat] = useState<ExportFormat>('JSON');
  const [includeAll, setIncludeAll] = useState(false);

  const handleGenerate = () => {
    if (!startDate || !endDate) return;

    const scope: AuditPackageScope = {
      timeRange: { startDate, endDate },
      includeAll,
    };

    if (strategyIds.trim()) {
      scope.strategyIds = strategyIds.split(',').map((s) => s.trim());
    }
    if (assetIds.trim()) {
      scope.assetIds = assetIds.split(',').map((s) => s.trim());
    }

    onGeneratePackage(scope, format);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="space-y-6">
      {/* Package Generator */}
      <Card>
        <CardHeader>
          <CardTitle>Generate Export Package</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">End Date</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Strategy IDs (optional)
              </label>
              <Input
                value={strategyIds}
                onChange={(e) => setStrategyIds(e.target.value)}
                placeholder="strategy-1, strategy-2"
                disabled={includeAll}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Asset IDs (optional)
              </label>
              <Input
                value={assetIds}
                onChange={(e) => setAssetIds(e.target.value)}
                placeholder="BTC, ETH"
                disabled={includeAll}
              />
            </div>
          </div>

          {/* Format and Include All */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Export Format</label>
              <Select
                options={formatOptions}
                value={format}
                onChange={(e) => setFormat(e.target.value as ExportFormat)}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={includeAll}
                  onChange={(e) => setIncludeAll(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-foreground">Include all data (no filters)</span>
              </label>
            </div>
          </div>

          {/* Package Contents Info */}
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium text-foreground mb-2">Package will include:</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Trade lifecycle logs</li>
              <li>• AI analysis traces</li>
              <li>• Risk events</li>
              <li>• Data lineage records</li>
            </ul>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={handleGenerate}
            loading={loading}
            disabled={!startDate || !endDate}
            className="w-full"
          >
            Generate Package
          </Button>
        </CardFooter>
      </Card>

      {/* Existing Packages */}
      <Card>
        <CardHeader>
          <CardTitle>Export Packages</CardTitle>
        </CardHeader>
        <CardContent>
          {packages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No export packages generated yet.
            </div>
          ) : (
            <div className="space-y-3">
              {packages.map((pkg) => (
                <div
                  key={pkg.packageId}
                  className="p-4 border border-border rounded-lg"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="info">{pkg.format}</Badge>
                        {pkg.compressed && <Badge variant="default">Compressed</Badge>}
                        {isExpired(pkg.downloadExpiresAt) && (
                          <Badge variant="error">Expired</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formatDate(pkg.scope.timeRange.startDate)} - {formatDate(pkg.scope.timeRange.endDate)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Generated {formatDate(pkg.generatedAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatFileSize(pkg.sizeBytes)}</p>
                      <p className="text-xs text-muted-foreground">
                        Expires {formatDate(pkg.downloadExpiresAt)}
                      </p>
                    </div>
                  </div>

                  {/* Contents Summary */}
                  <div className="grid grid-cols-4 gap-4 mb-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Trade Logs</p>
                      <p className="font-medium">{pkg.contents.tradeLifecycleLogs}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">AI Traces</p>
                      <p className="font-medium">{pkg.contents.aiTraces}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Risk Events</p>
                      <p className="font-medium">{pkg.contents.riskEvents}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Lineage Records</p>
                      <p className="font-medium">{pkg.contents.dataLineageRecords}</p>
                    </div>
                  </div>

                  {/* Integrity Hash */}
                  <div className="mb-3">
                    <p className="text-xs text-muted-foreground">
                      Integrity Hash ({pkg.hashAlgorithm})
                    </p>
                    <p className="text-xs font-mono truncate">{pkg.integrityHash}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {onDownloadPackage && !isExpired(pkg.downloadExpiresAt) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onDownloadPackage(pkg.packageId)}
                      >
                        Download
                      </Button>
                    )}
                    {onVerifyIntegrity && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onVerifyIntegrity(pkg.packageId)}
                      >
                        Verify Integrity
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
