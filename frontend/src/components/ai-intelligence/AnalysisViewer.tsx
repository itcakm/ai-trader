'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Select } from '../ui/Select';
import {
  AnalysisResult,
  RegimeClassification,
  StrategyExplanation,
  ParameterSuggestion,
  regimeVariant,
  impactVariant,
} from '../../types/ai-intelligence';

export interface AnalysisViewerProps {
  analyses: AnalysisResult[];
  loading?: boolean;
  onRefresh?: () => void;
  onRequestAnalysis?: (type: 'regime' | 'explanation' | 'suggestion') => void;
}

const typeOptions = [
  { value: '', label: 'All Types' },
  { value: 'regime', label: 'Regime Classification' },
  { value: 'explanation', label: 'Strategy Explanation' },
  { value: 'suggestion', label: 'Parameter Suggestion' },
];

export function AnalysisViewer({
  analyses,
  loading = false,
  onRefresh,
  onRequestAnalysis,
}: AnalysisViewerProps) {
  const [typeFilter, setTypeFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredAnalyses = typeFilter
    ? analyses.filter((a) => a.type === typeFilter)
    : analyses;

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>AI Analysis Results</CardTitle>
          <div className="flex items-center gap-2">
            {onRequestAnalysis && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRequestAnalysis('regime')}
                >
                  Classify Regime
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRequestAnalysis('suggestion')}
                >
                  Get Suggestions
                </Button>
              </>
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
        {/* Filter */}
        <div className="mb-6 w-48">
          <Select
            options={typeOptions}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          />
        </div>

        {/* Analysis List */}
        {loading && analyses.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : filteredAnalyses.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {analyses.length === 0
              ? 'No analysis results yet. Request an analysis to get started.'
              : 'No results match your filter.'}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAnalyses.map((analysis) => (
              <AnalysisCard
                key={analysis.id}
                analysis={analysis}
                expanded={expandedId === analysis.id}
                onToggleExpand={() =>
                  setExpandedId(expandedId === analysis.id ? null : analysis.id)
                }
                formatTime={formatTime}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface AnalysisCardProps {
  analysis: AnalysisResult;
  expanded: boolean;
  onToggleExpand: () => void;
  formatTime: (timestamp: string) => string;
}

function AnalysisCard({ analysis, expanded, onToggleExpand, formatTime }: AnalysisCardProps) {
  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'regime':
        return 'Regime Classification';
      case 'explanation':
        return 'Strategy Explanation';
      case 'suggestion':
        return 'Parameter Suggestions';
      default:
        return type;
    }
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3">
          <Badge variant="info">{getTypeLabel(analysis.type)}</Badge>
          <div>
            <p className="font-medium text-foreground">
              {analysis.strategyName || 'Market Analysis'}
            </p>
            <p className="text-sm text-muted-foreground">
              {analysis.modelName} • {formatTime(analysis.timestamp)}
            </p>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-muted-foreground transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {expanded && (
        <div className="border-t border-border p-4 bg-muted/30">
          {analysis.type === 'regime' && (
            <RegimeContent data={analysis.data as RegimeClassification} />
          )}
          {analysis.type === 'explanation' && (
            <ExplanationContent data={analysis.data as StrategyExplanation} />
          )}
          {analysis.type === 'suggestion' && (
            <SuggestionContent data={analysis.data as ParameterSuggestion[]} />
          )}
        </div>
      )}
    </div>
  );
}

function RegimeContent({ data }: { data: RegimeClassification }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Badge variant={regimeVariant[data.regime]} className="text-base px-3 py-1">
          {data.regime.replace(/_/g, ' ')}
        </Badge>
        <span className="text-sm text-muted-foreground">
          Confidence: {(data.confidence * 100).toFixed(1)}%
        </span>
      </div>
      <div>
        <h5 className="text-sm font-medium text-foreground mb-2">Reasoning</h5>
        <p className="text-sm text-muted-foreground">{data.reasoning}</p>
      </div>
      <div>
        <h5 className="text-sm font-medium text-foreground mb-2">Supporting Factors</h5>
        <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
          {data.supportingFactors.map((factor, i) => (
            <li key={i}>{factor}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ExplanationContent({ data }: { data: StrategyExplanation }) {
  return (
    <div className="space-y-4">
      <div>
        <h5 className="text-sm font-medium text-foreground mb-2">Explanation</h5>
        <p className="text-sm text-muted-foreground">{data.explanation}</p>
      </div>
      <div>
        <h5 className="text-sm font-medium text-foreground mb-2">Key Factors</h5>
        <div className="space-y-2">
          {data.keyFactors.map((factor, i) => (
            <div key={i} className="flex items-center justify-between p-2 bg-background rounded">
              <span className="text-sm">{factor.factor}</span>
              <div className="flex items-center gap-2">
                <Badge variant={impactVariant[factor.impact]}>{factor.impact}</Badge>
                <span className="text-xs text-muted-foreground">
                  Weight: {(factor.weight * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h5 className="text-sm font-medium text-foreground mb-2">Risk Assessment</h5>
        <p className="text-sm text-muted-foreground">{data.riskAssessment}</p>
      </div>
    </div>
  );
}

function SuggestionContent({ data }: { data: ParameterSuggestion[] }) {
  return (
    <div className="space-y-4">
      {data.map((suggestion, i) => (
        <div key={i} className="p-3 bg-background rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-foreground">{suggestion.parameterName}</span>
            <span className="text-xs text-muted-foreground">
              Confidence: {(suggestion.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <div className="flex items-center gap-4 mb-2 text-sm">
            <span className="text-muted-foreground">
              Current: <span className="font-mono">{String(suggestion.currentValue)}</span>
            </span>
            <span className="text-primary-600">→</span>
            <span className="text-foreground">
              Suggested: <span className="font-mono font-medium">{String(suggestion.suggestedValue)}</span>
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-1">{suggestion.rationale}</p>
          <p className="text-xs text-muted-foreground">Expected Impact: {suggestion.expectedImpact}</p>
        </div>
      ))}
    </div>
  );
}
