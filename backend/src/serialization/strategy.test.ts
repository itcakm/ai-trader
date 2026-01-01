import * as fc from 'fast-check';
import { serializeStrategy, deserializeStrategy, strategiesAreEqual } from './strategy';
import { strategyArb } from '../test/generators';

describe('Strategy Serialization', () => {
  /**
   * Property 5: Strategy Persistence Round-Trip
   * 
   * *For any* valid Strategy object, serializing to JSON, persisting to storage,
   * retrieving, and deserializing SHALL produce an equivalent Strategy object
   * with all parameter values preserved.
   * 
   * **Validates: Requirements 2.4, 2.6, 5.2, 5.3**
   */
  it('Property 5: Strategy Persistence Round-Trip - serialize then deserialize produces equivalent strategy', () => {
    fc.assert(
      fc.property(strategyArb(), (strategy) => {
        // Serialize the strategy
        const serialized = serializeStrategy(strategy);
        
        // Deserialize back to Strategy
        const deserialized = deserializeStrategy(serialized);
        
        // Verify equivalence
        return strategiesAreEqual(strategy, deserialized);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property: serialization produces valid JSON for parameters
   */
  it('serialization produces valid JSON string for parameters', () => {
    fc.assert(
      fc.property(strategyArb(), (strategy) => {
        const serialized = serializeStrategy(strategy);
        
        // Parameters should be a valid JSON string
        expect(() => JSON.parse(serialized.parameters)).not.toThrow();
        
        // Parsed parameters should match original
        const parsedParams = JSON.parse(serialized.parameters);
        return Object.keys(strategy.parameters).every(
          key => strategy.parameters[key] === parsedParams[key]
        );
      }),
      { numRuns: 100 }
    );
  });
});
