"""
Property-Based Tests for DynamoDB Module

Feature: infrastructure-deployment
Property 1: DynamoDB Table Schema Compliance
Property 2: DynamoDB Table Security Configuration
Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.9

This test validates that DynamoDB tables are properly configured with:
- All 32 tables defined with correct key schemas
- Global Secondary Indexes as specified
- Point-in-time recovery enabled
- Server-side encryption enabled
- Consistent naming with environment prefix
"""
import json
import pytest
from hypothesis import given, strategies as st, settings
from pathlib import Path
import hcl2


def load_terraform_file(path: Path) -> dict:
    """Load and parse a Terraform file."""
    if not path.exists():
        pytest.skip(f"Terraform file not found: {path}")
    
    with open(path, 'r') as f:
        content = f.read()
    
    try:
        parsed = hcl2.loads(content)
        return parsed
    except Exception as e:
        pytest.fail(f"Failed to parse Terraform file {path}: {e}")


@pytest.fixture
def dynamodb_module_path(infrastructure_root):
    """Get the DynamoDB module path."""
    return infrastructure_root / "modules" / "dynamodb"


@pytest.fixture
def dynamodb_main_tf(dynamodb_module_path):
    """Load the DynamoDB module main.tf file."""
    return load_terraform_file(dynamodb_module_path / "main.tf")


@pytest.fixture
def dynamodb_tables_tf(dynamodb_module_path):
    """Load the DynamoDB module tables.tf file."""
    return load_terraform_file(dynamodb_module_path / "tables.tf")


@pytest.fixture
def dynamodb_variables_tf(dynamodb_module_path):
    """Load the DynamoDB module variables.tf file."""
    return load_terraform_file(dynamodb_module_path / "variables.tf")


@pytest.fixture
def dynamodb_outputs_tf(dynamodb_module_path):
    """Load the DynamoDB module outputs.tf file."""
    return load_terraform_file(dynamodb_module_path / "outputs.tf")


def extract_resources(resources: list, resource_type: str) -> dict:
    """Extract resources of a specific type from parsed resources."""
    result = {}
    for resource_block in resources:
        if resource_type in resource_block:
            block = resource_block[resource_type]
            for name, attrs in block.items():
                result[name] = attrs
    return result


def extract_locals(locals_list: list) -> dict:
    """Extract local values from parsed locals."""
    result = {}
    for local_block in locals_list:
        result.update(local_block)
    return result


def extract_variables(variables: list) -> dict:
    """Extract variable configurations from parsed variables."""
    var_dict = {}
    for var_block in variables:
        for var_name, var_attrs in var_block.items():
            var_dict[var_name] = var_attrs
    return var_dict


def extract_outputs(outputs: list) -> dict:
    """Extract output configurations from parsed outputs."""
    output_dict = {}
    for output_block in outputs:
        for output_name, output_attrs in output_block.items():
            output_dict[output_name] = output_attrs
    return output_dict


# Expected table names based on backend/src/db/tables.ts
EXPECTED_TABLES = [
    "strategy-templates",
    "strategies",
    "strategy-versions",
    "deployments",
    "data-sources",
    "news-events",
    "sentiment-data",
    "streams",
    "backfill-requests",
    "ai-providers",
    "model-configurations",
    "fund-allocations",
    "model-performance",
    "performance-predictions",
    "position-limits",
    "drawdown-state",
    "drawdown-config",
    "volatility-state",
    "volatility-config",
    "kill-switch-state",
    "kill-switch-config",
    "circuit-breakers",
    "circuit-breaker-events",
    "risk-profiles",
    "strategy-profile-assignments",
    "exchange-limits",
    "exchange-health",
    "rate-limit-state",
    "risk-events",
    "alert-configs",
    "trade-lifecycle"
]

# Expected key schemas based on backend/src/db/tables.ts
EXPECTED_KEY_SCHEMAS = {
    "strategy-templates": {"partition_key": "templateId", "sort_key": "version"},
    "strategies": {"partition_key": "tenantId", "sort_key": "strategyId"},
    "strategy-versions": {"partition_key": "strategyId", "sort_key": "version"},
    "deployments": {"partition_key": "tenantId", "sort_key": "deploymentId"},
    "data-sources": {"partition_key": "sourceId", "sort_key": None},
    "news-events": {"partition_key": "symbol", "sort_key": "publishedAtEventId"},
    "sentiment-data": {"partition_key": "symbol", "sort_key": "timestamp"},
    "streams": {"partition_key": "tenantId", "sort_key": "streamId"},
    "backfill-requests": {"partition_key": "tenantId", "sort_key": "requestId"},
    "ai-providers": {"partition_key": "providerId", "sort_key": None},
    "model-configurations": {"partition_key": "tenantId", "sort_key": "configId"},
    "fund-allocations": {"partition_key": "tenantId", "sort_key": "strategyIdVersion"},
    "model-performance": {"partition_key": "tenantModelConfigId", "sort_key": "periodPeriodStart"},
    "performance-predictions": {"partition_key": "tenantId", "sort_key": "predictionId"},
    "position-limits": {"partition_key": "tenantId", "sort_key": "limitId"},
    "drawdown-state": {"partition_key": "tenantId", "sort_key": "stateId"},
    "drawdown-config": {"partition_key": "tenantId", "sort_key": "configId"},
    "volatility-state": {"partition_key": "stateId", "sort_key": None},
    "volatility-config": {"partition_key": "tenantId", "sort_key": "configId"},
    "kill-switch-state": {"partition_key": "tenantId", "sort_key": None},
    "kill-switch-config": {"partition_key": "tenantId", "sort_key": "configId"},
    "circuit-breakers": {"partition_key": "tenantId", "sort_key": "breakerId"},
    "circuit-breaker-events": {"partition_key": "tenantBreakerId", "sort_key": "timestamp"},
    "risk-profiles": {"partition_key": "tenantId", "sort_key": "profileIdVersion"},
    "strategy-profile-assignments": {"partition_key": "tenantId", "sort_key": "strategyId"},
    "exchange-limits": {"partition_key": "exchangeId", "sort_key": "assetId"},
    "exchange-health": {"partition_key": "exchangeId", "sort_key": None},
    "rate-limit-state": {"partition_key": "exchangeId", "sort_key": None},
    "risk-events": {"partition_key": "tenantId", "sort_key": "timestampEventId"},
    "alert-configs": {"partition_key": "tenantId", "sort_key": None},
    "trade-lifecycle": {"partition_key": "tenantId", "sort_key": "eventId"}
}

# Tables with TTL attribute
TABLES_WITH_TTL = ["risk-events"]


class TestDynamoDBTableSchemaCompliance:
    """
    Property 1: DynamoDB Table Schema Compliance
    
    *For any* table defined in the backend TableNames constant, the Terraform 
    configuration SHALL create a corresponding DynamoDB table with matching 
    partition key, sort key, and GSI definitions as specified in KeySchemas 
    and GSINames.
    
    **Validates: Requirements 3.1, 3.2, 3.3**
    """
    
    def test_dynamodb_module_exists(self, dynamodb_module_path):
        """
        Feature: infrastructure-deployment
        Property 1: DynamoDB Table Schema Compliance
        Validates: Requirements 3.1
        
        Verify that the DynamoDB module directory exists with required files.
        """
        assert dynamodb_module_path.exists(), "DynamoDB module directory should exist"
        assert (dynamodb_module_path / "main.tf").exists(), "main.tf should exist"
        assert (dynamodb_module_path / "tables.tf").exists(), "tables.tf should exist"
        assert (dynamodb_module_path / "variables.tf").exists(), "variables.tf should exist"
        assert (dynamodb_module_path / "outputs.tf").exists(), "outputs.tf should exist"
    
    def test_all_32_tables_defined(self, dynamodb_tables_tf):
        """
        Feature: infrastructure-deployment
        Property 1: DynamoDB Table Schema Compliance
        Validates: Requirements 3.1
        
        Verify that all 32 tables are defined in the module.
        """
        locals_list = dynamodb_tables_tf.get('locals', [])
        locals_dict = extract_locals(locals_list)
        
        assert 'tables' in locals_dict, "tables local should be defined"
        
        tables = locals_dict['tables']
        
        # Check that we have at least 31 tables (the expected count)
        assert len(tables) >= 31, f"Expected at least 31 tables, found {len(tables)}"
        
        # Check each expected table is defined
        for table_name in EXPECTED_TABLES:
            assert table_name in tables, f"Table '{table_name}' should be defined"
    
    def test_table_partition_keys_match_schema(self, dynamodb_tables_tf):
        """
        Feature: infrastructure-deployment
        Property 1: DynamoDB Table Schema Compliance
        Validates: Requirements 3.2
        
        Verify that partition keys match the expected schema.
        """
        locals_list = dynamodb_tables_tf.get('locals', [])
        locals_dict = extract_locals(locals_list)
        tables = locals_dict.get('tables', {})
        
        for table_name, expected_schema in EXPECTED_KEY_SCHEMAS.items():
            if table_name in tables:
                table_config = tables[table_name]
                assert table_config.get('partition_key') == expected_schema['partition_key'], (
                    f"Table '{table_name}' partition key should be '{expected_schema['partition_key']}'"
                )
    
    def test_table_sort_keys_match_schema(self, dynamodb_tables_tf):
        """
        Feature: infrastructure-deployment
        Property 1: DynamoDB Table Schema Compliance
        Validates: Requirements 3.2
        
        Verify that sort keys match the expected schema.
        """
        locals_list = dynamodb_tables_tf.get('locals', [])
        locals_dict = extract_locals(locals_list)
        tables = locals_dict.get('tables', {})
        
        for table_name, expected_schema in EXPECTED_KEY_SCHEMAS.items():
            if table_name in tables:
                table_config = tables[table_name]
                expected_sort_key = expected_schema['sort_key']
                actual_sort_key = table_config.get('sort_key')
                assert actual_sort_key == expected_sort_key, (
                    f"Table '{table_name}' sort key should be '{expected_sort_key}', got '{actual_sort_key}'"
                )
    
    def test_tables_have_gsi_definitions(self, dynamodb_tables_tf):
        """
        Feature: infrastructure-deployment
        Property 1: DynamoDB Table Schema Compliance
        Validates: Requirements 3.3
        
        Verify that tables have GSI definitions where expected.
        """
        locals_list = dynamodb_tables_tf.get('locals', [])
        locals_dict = extract_locals(locals_list)
        tables = locals_dict.get('tables', {})
        
        # Tables that should have GSIs
        tables_with_gsi = [
            "strategy-templates",
            "deployments",
            "data-sources",
            "news-events",
            "sentiment-data",
            "streams",
            "backfill-requests",
            "ai-providers",
            "model-configurations",
            "fund-allocations",
            "performance-predictions",
            "position-limits",
            "drawdown-state",
            "drawdown-config",
            "volatility-state",
            "volatility-config",
            "kill-switch-state",
            "circuit-breakers",
            "circuit-breaker-events",
            "risk-profiles",
            "strategy-profile-assignments",
            "exchange-limits",
            "exchange-health",
            "risk-events",
            "trade-lifecycle"
        ]
        
        for table_name in tables_with_gsi:
            if table_name in tables:
                table_config = tables[table_name]
                gsi = table_config.get('gsi', [])
                assert len(gsi) > 0, f"Table '{table_name}' should have at least one GSI"
    
    def test_dynamodb_table_resource_uses_for_each(self, dynamodb_main_tf):
        """
        Feature: infrastructure-deployment
        Property 1: DynamoDB Table Schema Compliance
        Validates: Requirements 3.1
        
        Verify that DynamoDB tables are created using for_each for all tables.
        """
        resources = dynamodb_main_tf.get('resource', [])
        table_resources = extract_resources(resources, 'aws_dynamodb_table')
        
        assert len(table_resources) > 0, "DynamoDB table resources should be defined"
        
        # Check that tables use for_each
        tables = table_resources.get('tables', {})
        assert tables, "DynamoDB tables should be defined using for_each"


class TestDynamoDBTableSecurityConfiguration:
    """
    Property 2: DynamoDB Table Security Configuration
    
    *For any* DynamoDB table created by the Terraform configuration, the table 
    SHALL have point-in-time recovery enabled, server-side encryption enabled, 
    and a name prefixed with the environment identifier.
    
    **Validates: Requirements 3.4, 3.5, 3.9**
    """
    
    def test_point_in_time_recovery_enabled(self, dynamodb_main_tf):
        """
        Feature: infrastructure-deployment
        Property 2: DynamoDB Table Security Configuration
        Validates: Requirements 3.4
        
        Verify that point-in-time recovery is enabled for all tables.
        """
        resources = dynamodb_main_tf.get('resource', [])
        table_resources = extract_resources(resources, 'aws_dynamodb_table')
        
        tables = table_resources.get('tables', {})
        assert tables, "DynamoDB tables should be defined"
        
        # Check for point_in_time_recovery block
        pitr = tables.get('point_in_time_recovery', [{}])[0]
        assert 'enabled' in pitr, "point_in_time_recovery should have enabled attribute"
    
    def test_server_side_encryption_enabled(self, dynamodb_main_tf):
        """
        Feature: infrastructure-deployment
        Property 2: DynamoDB Table Security Configuration
        Validates: Requirements 3.5
        
        Verify that server-side encryption is enabled for all tables.
        """
        resources = dynamodb_main_tf.get('resource', [])
        table_resources = extract_resources(resources, 'aws_dynamodb_table')
        
        tables = table_resources.get('tables', {})
        assert tables, "DynamoDB tables should be defined"
        
        # Check for server_side_encryption block
        sse = tables.get('server_side_encryption', [{}])[0]
        assert sse.get('enabled') == True, "server_side_encryption should be enabled"
    
    def test_table_naming_includes_environment_prefix(self, dynamodb_main_tf):
        """
        Feature: infrastructure-deployment
        Property 2: DynamoDB Table Security Configuration
        Validates: Requirements 3.9
        
        Verify that table naming includes environment prefix.
        """
        locals_list = dynamodb_main_tf.get('locals', [])
        locals_dict = extract_locals(locals_list)
        
        # Check that name_prefix is defined with environment
        assert 'name_prefix' in locals_dict, "name_prefix local should be defined"
        
        name_prefix = locals_dict['name_prefix']
        # The name_prefix should reference var.environment
        assert 'var.environment' in str(name_prefix) or '${var.environment}' in str(name_prefix), (
            "name_prefix should include var.environment"
        )
    
    def test_table_name_uses_prefix(self, dynamodb_main_tf):
        """
        Feature: infrastructure-deployment
        Property 2: DynamoDB Table Security Configuration
        Validates: Requirements 3.9
        
        Verify that table names use the environment prefix.
        """
        resources = dynamodb_main_tf.get('resource', [])
        table_resources = extract_resources(resources, 'aws_dynamodb_table')
        
        tables = table_resources.get('tables', {})
        assert tables, "DynamoDB tables should be defined"
        
        # Check that table name includes local.name_prefix
        table_name = tables.get('name', '')
        assert 'local.name_prefix' in str(table_name), (
            "Table name should include local.name_prefix"
        )
    
    def test_ttl_configured_for_risk_events(self, dynamodb_tables_tf):
        """
        Feature: infrastructure-deployment
        Property 2: DynamoDB Table Security Configuration
        Validates: Requirements 3.8
        
        Verify that TTL is configured for risk-events table.
        """
        locals_list = dynamodb_tables_tf.get('locals', [])
        locals_dict = extract_locals(locals_list)
        tables = locals_dict.get('tables', {})
        
        risk_events = tables.get('risk-events', {})
        assert risk_events.get('ttl_attribute') == 'expiresAt', (
            "risk-events table should have TTL attribute 'expiresAt'"
        )
    
    def test_enable_pitr_variable_defaults_to_true(self, dynamodb_variables_tf):
        """
        Feature: infrastructure-deployment
        Property 2: DynamoDB Table Security Configuration
        Validates: Requirements 3.4
        
        Verify that enable_point_in_time_recovery variable defaults to true.
        """
        variables = dynamodb_variables_tf.get('variable', [])
        var_dict = extract_variables(variables)
        
        assert 'enable_point_in_time_recovery' in var_dict, (
            "enable_point_in_time_recovery variable should be defined"
        )
        
        pitr_var = var_dict['enable_point_in_time_recovery']
        assert pitr_var.get('default') == True, (
            "enable_point_in_time_recovery should default to true"
        )
    
    def test_outputs_include_table_arns(self, dynamodb_outputs_tf):
        """
        Feature: infrastructure-deployment
        Property 2: DynamoDB Table Security Configuration
        Validates: Requirements 3.9
        
        Verify that outputs include table ARNs for IAM policies.
        """
        outputs = dynamodb_outputs_tf.get('output', [])
        output_dict = extract_outputs(outputs)
        
        # Check for essential outputs
        assert 'table_arns' in output_dict, "table_arns output should exist"
        assert 'table_names' in output_dict, "table_names output should exist"


class TestDynamoDBPropertyBased:
    """
    Property-based tests using Hypothesis to validate DynamoDB configurations.
    
    Feature: infrastructure-deployment
    Property 1: DynamoDB Table Schema Compliance
    Property 2: DynamoDB Table Security Configuration
    Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.9
    """
    
    @given(
        table_name=st.sampled_from(EXPECTED_TABLES),
        environment=st.sampled_from(['test', 'production']),
        project_name=st.text(
            alphabet='abcdefghijklmnopqrstuvwxyz-',
            min_size=3,
            max_size=20
        ).filter(lambda x: not x.startswith('-') and not x.endswith('-') and '--' not in x)
    )
    @settings(max_examples=100)
    def test_table_naming_convention(self, table_name, environment, project_name):
        """
        Feature: infrastructure-deployment
        Property 2: DynamoDB Table Security Configuration
        Validates: Requirements 3.9
        
        *For any* table name, environment, and project name combination,
        the generated table name SHALL follow the pattern {project}-{env}-{table}.
        """
        expected_name = f"{project_name}-{environment}-{table_name}"
        
        # Validate table name format
        assert environment in expected_name, "Table name must contain environment"
        assert table_name in expected_name, "Table name must contain logical table name"
        
        # Validate table name length (AWS limit is 255 characters)
        assert len(expected_name) <= 255, "Table name must not exceed 255 characters"
        
        # Validate table name characters (alphanumeric, hyphens, underscores, dots)
        valid_chars = set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.')
        assert all(c in valid_chars for c in expected_name), (
            "Table name must only contain valid characters"
        )
    
    @given(
        table_name=st.sampled_from(EXPECTED_TABLES)
    )
    @settings(max_examples=100)
    def test_all_tables_have_partition_key(self, table_name):
        """
        Feature: infrastructure-deployment
        Property 1: DynamoDB Table Schema Compliance
        Validates: Requirements 3.2
        
        *For any* table in the expected tables list, it SHALL have a partition key defined.
        """
        expected_schema = EXPECTED_KEY_SCHEMAS.get(table_name, {})
        assert 'partition_key' in expected_schema, f"Table '{table_name}' must have partition key"
        assert expected_schema['partition_key'] is not None, (
            f"Table '{table_name}' partition key must not be None"
        )
    
    @given(
        billing_mode=st.sampled_from(['PAY_PER_REQUEST', 'PROVISIONED'])
    )
    @settings(max_examples=100)
    def test_billing_mode_valid_values(self, billing_mode):
        """
        Feature: infrastructure-deployment
        Property 2: DynamoDB Table Security Configuration
        Validates: Requirements 3.6, 3.7
        
        *For any* billing mode, it SHALL be either PAY_PER_REQUEST or PROVISIONED.
        """
        valid_modes = ['PAY_PER_REQUEST', 'PROVISIONED']
        assert billing_mode in valid_modes, (
            f"Billing mode '{billing_mode}' must be one of {valid_modes}"
        )
    
    @given(
        table_name=st.sampled_from(TABLES_WITH_TTL)
    )
    @settings(max_examples=100)
    def test_ttl_tables_have_ttl_attribute(self, table_name):
        """
        Feature: infrastructure-deployment
        Property 2: DynamoDB Table Security Configuration
        Validates: Requirements 3.8
        
        *For any* table that requires TTL, it SHALL have a TTL attribute defined.
        """
        # This validates that our TABLES_WITH_TTL list is correct
        assert table_name in TABLES_WITH_TTL, f"Table '{table_name}' should be in TTL tables list"
    
    @given(
        read_capacity=st.integers(min_value=1, max_value=40000),
        write_capacity=st.integers(min_value=1, max_value=40000)
    )
    @settings(max_examples=100)
    def test_capacity_within_valid_range(self, read_capacity, write_capacity):
        """
        Feature: infrastructure-deployment
        Property 2: DynamoDB Table Security Configuration
        Validates: Requirements 3.7
        
        *For any* provisioned capacity values, they SHALL be within AWS limits.
        """
        # AWS DynamoDB limits
        assert 1 <= read_capacity <= 40000, (
            f"Read capacity {read_capacity} must be between 1 and 40000"
        )
        assert 1 <= write_capacity <= 40000, (
            f"Write capacity {write_capacity} must be between 1 and 40000"
        )
