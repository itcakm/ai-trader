'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import {
  ReportTemplate,
  ComplianceReport,
  ReportFilters,
  ReportFormat,
  reportStatusVariant,
} from '../../types/reporting';

export interface ReportGeneratorProps {
  templates: ReportTemplate[];
  recentReports: ComplianceReport[];
  loading?: boolean;
  onGenerateReport: (templateId: string, filters: ReportFilters) => void;
  onDownloadReport?: (reportId: string) => void;
  onViewReport?: (report: ComplianceReport) => void;
}

export function ReportGenerator({
  templates,
  recentReports,
  loading = false,
  onGenerateReport,
  onDownloadReport,
  onViewReport,
}: ReportGeneratorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [assetIds, setAssetIds] = useState('');
  const [strategyIds, setStrategyIds] = useState('');

  const templateOptions = [
    { value: '', label: 'Select a template...' },
    ...templates.map((t) => ({ value: t.templateId, label: t.name })),
  ];

  const selectedTemplateData = templates.find((t) => t.templateId === selectedTemplate);

  const handleGenerate = () => {
    if (!selectedTemplate) return;

    const filters: ReportFilters = {};
    if (startDate && endDate) {
      filters.dateRange = { startDate, endDate };
    }
    if (assetIds.trim()) {
      filters.assetIds = assetIds.split(',').map((s) => s.trim());
    }
    if (strategyIds.trim()) {
      filters.strategyIds = strategyIds.split(',').map((s) => s.trim());
    }

    onGenerateReport(selectedTemplate, filters);
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

  return (
    <div className="space-y-6">
      {/* Report Generator */}
      <Card>
        <CardHeader>
          <CardTitle>Generate Report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Template Selection */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Report Template</label>
            <Select
              options={templateOptions}
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
            />
            {selectedTemplateData && (
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedTemplateData.description}
              </p>
            )}
          </div>

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
                Asset IDs (optional)
              </label>
              <Input
                value={assetIds}
                onChange={(e) => setAssetIds(e.target.value)}
                placeholder="BTC, ETH, SOL"
              />
              <p className="mt-1 text-xs text-muted-foreground">Comma-separated</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Strategy IDs (optional)
              </label>
              <Input
                value={strategyIds}
                onChange={(e) => setStrategyIds(e.target.value)}
                placeholder="strategy-1, strategy-2"
              />
              <p className="mt-1 text-xs text-muted-foreground">Comma-separated</p>
            </div>
          </div>

          {/* Template Sections Preview */}
          {selectedTemplateData && (
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Report Sections</p>
              <div className="flex flex-wrap gap-2">
                {selectedTemplateData.sections.map((section) => (
                  <Badge key={section.sectionId} variant="default">
                    {section.title}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button
            onClick={handleGenerate}
            loading={loading}
            disabled={!selectedTemplate}
            className="w-full"
          >
            Generate Report
          </Button>
        </CardFooter>
      </Card>

      {/* Recent Reports */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Reports</CardTitle>
        </CardHeader>
        <CardContent>
          {recentReports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No reports generated yet.
            </div>
          ) : (
            <div className="space-y-3">
              {recentReports.map((report) => (
                <div
                  key={report.reportId}
                  className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => onViewReport?.(report)}
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {templates.find((t) => t.templateId === report.templateId)?.name || 'Report'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(report.dateRange.startDate)} - {formatDate(report.dateRange.endDate)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Generated {formatDate(report.generatedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="info">{report.format}</Badge>
                    {onDownloadReport && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDownloadReport(report.reportId);
                        }}
                      >
                        Download
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
