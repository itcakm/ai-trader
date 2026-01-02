'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import {
  Strategy,
  StrategyTemplate,
  StrategyFormData,
  ParameterDefinition,
  ParameterValue,
} from '../../types/strategy';

export interface StrategyFormProps {
  strategy?: Strategy;
  templates: StrategyTemplate[];
  loading?: boolean;
  onSubmit: (data: StrategyFormData) => void;
  onCancel: () => void;
}

export function StrategyForm({
  strategy,
  templates,
  loading = false,
  onSubmit,
  onCancel,
}: StrategyFormProps) {
  const isEditing = !!strategy;
  const [name, setName] = useState(strategy?.name || '');
  const [templateId, setTemplateId] = useState(strategy?.templateId || '');
  const [parameters, setParameters] = useState<Record<string, ParameterValue>>(
    strategy?.parameters || {}
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedTemplate = templates.find((t) => t.templateId === templateId);

  useEffect(() => {
    if (selectedTemplate && !isEditing) {
      const defaultParams: Record<string, ParameterValue> = {};
      selectedTemplate.parameters.forEach((param) => {
        defaultParams[param.name] = param.defaultValue;
      });
      setParameters(defaultParams);
    }
  }, [templateId, selectedTemplate, isEditing]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Strategy name is required';
    }

    if (!templateId) {
      newErrors.templateId = 'Please select a template';
    }

    if (selectedTemplate) {
      selectedTemplate.parameters.forEach((param) => {
        const value = parameters[param.name];
        if (param.required && (value === undefined || value === '')) {
          newErrors[param.name] = `${param.name} is required`;
        }
        if (param.dataType === 'number' && param.hardBounds) {
          const numValue = Number(value);
          if (param.hardBounds.min !== undefined && numValue < param.hardBounds.min) {
            newErrors[param.name] = `Minimum value is ${param.hardBounds.min}`;
          }
          if (param.hardBounds.max !== undefined && numValue > param.hardBounds.max) {
            newErrors[param.name] = `Maximum value is ${param.hardBounds.max}`;
          }
        }
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit({ name, templateId, parameters });
    }
  };

  const handleParameterChange = (paramName: string, value: ParameterValue) => {
    setParameters((prev) => ({ ...prev, [paramName]: value }));
    if (errors[paramName]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[paramName];
        return newErrors;
      });
    }
  };

  const templateOptions = [
    { value: '', label: 'Select a template...' },
    ...templates.map((t) => ({ value: t.templateId, label: t.name })),
  ];

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle>{isEditing ? 'Edit Strategy' : 'Create Strategy'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Strategy Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Strategy Name
            </label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) {
                  setErrors((prev) => {
                    const newErrors = { ...prev };
                    delete newErrors.name;
                    return newErrors;
                  });
                }
              }}
              placeholder="Enter strategy name"
              error={errors.name}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name}</p>
            )}
          </div>

          {/* Template Selection */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Template
            </label>
            <Select
              options={templateOptions}
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              disabled={isEditing}
            />
            {errors.templateId && (
              <p className="mt-1 text-sm text-red-600">{errors.templateId}</p>
            )}
            {selectedTemplate && (
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedTemplate.description}
              </p>
            )}
          </div>

          {/* Parameters */}
          {selectedTemplate && selectedTemplate.parameters.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-foreground mb-3">Parameters</h4>
              <div className="space-y-4">
                {selectedTemplate.parameters.map((param) => (
                  <ParameterInput
                    key={param.name}
                    definition={param}
                    value={parameters[param.name]}
                    onChange={(value) => handleParameterChange(param.name, value)}
                    error={errors[param.name]}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            {isEditing ? 'Save Changes' : 'Create Strategy'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}


interface ParameterInputProps {
  definition: ParameterDefinition;
  value: ParameterValue;
  onChange: (value: ParameterValue) => void;
  error?: string;
}

function ParameterInput({ definition, value, onChange, error }: ParameterInputProps) {
  const { name, dataType, description, hardBounds, enumValues, required } = definition;

  const renderInput = () => {
    switch (dataType) {
      case 'boolean':
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => onChange(e.target.checked)}
              className="w-4 h-4 rounded border-border text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-foreground">Enabled</span>
          </label>
        );

      case 'enum':
        return (
          <Select
            options={[
              { value: '', label: 'Select...' },
              ...(enumValues || []).map((v) => ({ value: v, label: v })),
            ]}
            value={String(value || '')}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case 'number':
        return (
          <Input
            type="number"
            value={value !== undefined ? String(value) : ''}
            onChange={(e) => onChange(Number(e.target.value))}
            min={hardBounds?.min}
            max={hardBounds?.max}
            error={error}
          />
        );

      default:
        return (
          <Input
            type="text"
            value={String(value || '')}
            onChange={(e) => onChange(e.target.value)}
            pattern={hardBounds?.pattern}
            error={error}
          />
        );
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">
        {name}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {renderInput()}
      {description && (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      )}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
