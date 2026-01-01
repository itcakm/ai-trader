import * as fc from 'fast-check';
import { strategyTemplateArb, parameterDefinitionArb } from '../test/generators';
import { StrategyTemplate, ParameterDefinition } from './template';

/**
 * Feature: strategy-management, Property 1: Template Structure Completeness
 * 
 * For any Strategy_Template, it SHALL contain a non-empty templateId, name, 
 * description, version number, and a parameters array where each parameter 
 * has name, dataType, defaultValue, required flag, and description.
 * 
 * Validates: Requirements 1.3, 1.4
 */
describe('Property 1: Template Structure Completeness', () => {
  /**
   * Helper to check if a template has all required fields with valid values
   */
  const isTemplateStructureComplete = (template: StrategyTemplate): boolean => {
    // Check template-level required fields
    if (!template.templateId || template.templateId.length === 0) return false;
    if (!template.name || template.name.length === 0) return false;
    if (!template.description || template.description.length === 0) return false;
    if (typeof template.version !== 'number' || template.version < 1) return false;
    if (!Array.isArray(template.parameters)) return false;
    
    // Check each parameter has required fields
    for (const param of template.parameters) {
      if (!isParameterDefinitionComplete(param)) return false;
    }
    
    return true;
  };

  /**
   * Helper to check if a parameter definition has all required fields
   */
  const isParameterDefinitionComplete = (param: ParameterDefinition): boolean => {
    if (!param.name || param.name.length === 0) return false;
    if (!['number', 'string', 'boolean', 'enum'].includes(param.dataType)) return false;
    if (param.defaultValue === undefined) return false;
    if (typeof param.required !== 'boolean') return false;
    if (!param.description || param.description.length === 0) return false;
    
    // For enum type, enumValues should be present and non-empty
    if (param.dataType === 'enum') {
      if (!param.enumValues || param.enumValues.length === 0) return false;
    }
    
    return true;
  };

  it('should ensure all generated templates have complete structure', () => {
    fc.assert(
      fc.property(strategyTemplateArb(), (template) => {
        return isTemplateStructureComplete(template);
      }),
      { numRuns: 100 }
    );
  });

  it('should ensure all generated parameter definitions have complete structure', () => {
    fc.assert(
      fc.property(parameterDefinitionArb(), (param) => {
        return isParameterDefinitionComplete(param);
      }),
      { numRuns: 100 }
    );
  });

  it('should ensure template version is always a positive integer', () => {
    fc.assert(
      fc.property(strategyTemplateArb(), (template) => {
        return Number.isInteger(template.version) && template.version >= 1;
      }),
      { numRuns: 100 }
    );
  });

  it('should ensure parameter defaultValue matches declared dataType', () => {
    fc.assert(
      fc.property(parameterDefinitionArb(), (param) => {
        switch (param.dataType) {
          case 'number':
            return typeof param.defaultValue === 'number';
          case 'string':
            return typeof param.defaultValue === 'string';
          case 'boolean':
            return typeof param.defaultValue === 'boolean';
          case 'enum':
            return typeof param.defaultValue === 'string' && 
                   param.enumValues !== undefined &&
                   param.enumValues.includes(param.defaultValue as string);
          default:
            return false;
        }
      }),
      { numRuns: 100 }
    );
  });
});
