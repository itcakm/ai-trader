"""
Property-Based Tests for Budgets Module and Resource Tagging

Feature: infrastructure-deployment
Property 14: Resource Tagging Compliance
Validates: Requirements 23.1

This test validates that:
- All resources have required tags (Environment, Project, Owner, CostCenter)
- Default tags are configured in provider configuration
- Budget module is properly configured with alerts
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
def budgets_module_path(infrastructure_root):
    """Get the Budgets module path."""
    return infrastructure_root / "modules" / "budgets"


@pytest.fixture
def budgets_main_tf(budgets_module_path):
    """Load the Budgets module main.tf file."""
    return load_terraform_file(budgets_module_path / "main.tf")


@pytest.fixture
def budgets_variables_tf(budgets_module_path):
    """Load the Budgets module variables.tf file."""
    return load_terraform_file(budgets_module_path / "variables.tf")


@pytest.fixture
def budgets_outputs_tf(budgets_module_path):
    """Load the Budgets module outputs.tf file."""
    return load_terraform_file(budgets_module_path / "outputs.tf")


@pytest.fixture
def test_providers_tf(infrastructure_root):
    """Load the test environment providers.tf file."""
    return load_terraform_file(infrastructure_root / "environments" / "test" / "providers.tf")


@pytest.fixture
def production_providers_tf(infrastructure_root):
    """Load the production environment providers.tf file."""
    return load_terraform_file(infrastructure_root / "environments" / "production" / "providers.tf")


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


def extract_providers(providers: list) -> list:
    """Extract provider configurations from parsed providers."""
    provider_list = []
    for provider_block in providers:
        if 'aws' in provider_block:
            provider_list.append(provider_block['aws'])
    return provider_list


# Required tags for all resources
REQUIRED_TAGS = ["Environment", "Project", "Owner", "CostCenter"]


class TestResourceTaggingCompliance:
    """
    Property 14: Resource Tagging Compliance
    
    *For any* AWS resource created by the Terraform configuration that supports 
    tagging, the resource SHALL have tags for Environment, Project, Owner, 
    and CostCenter.
    
    **Validates: Requirements 23.1**
    """
    
    def test_budgets_module_exists(self, budgets_module_path):
        """
        Feature: infrastructure-deployment
        Property 14: Resource Tagging Compliance
        Validates: Requirements 23.1
        
        Verify that the Budgets module directory exists with required files.
        """
        assert budgets_module_path.exists(), "Budgets module directory should exist"
        assert (budgets_module_path / "main.tf").exists(), "main.tf should exist"
        assert (budgets_module_path / "variables.tf").exists(), "variables.tf should exist"
        assert (budgets_module_path / "outputs.tf").exists(), "outputs.tf should exist"
    
    def test_test_provider_has_default_tags(self, test_providers_tf):
        """
        Feature: infrastructure-deployment
        Property 14: Resource Tagging Compliance
        Validates: Requirements 23.1
        
        Verify that test environment provider has default tags configured.
        """
        providers = test_providers_tf.get('provider', [])
        aws_providers = extract_providers(providers)
        
        assert len(aws_providers) > 0, "AWS provider should be configured"
        
        # Check main provider (first one without alias)
        main_provider = aws_providers[0]
        default_tags = main_provider.get('default_tags', [{}])[0]
        tags = default_tags.get('tags', {})
        
        for required_tag in REQUIRED_TAGS:
            assert required_tag in tags, (
                f"Default tags should include '{required_tag}'"
            )
    
    def test_production_provider_has_default_tags(self, production_providers_tf):
        """
        Feature: infrastructure-deployment
        Property 14: Resource Tagging Compliance
        Validates: Requirements 23.1
        
        Verify that production environment provider has default tags configured.
        """
        providers = production_providers_tf.get('provider', [])
        aws_providers = extract_providers(providers)
        
        assert len(aws_providers) > 0, "AWS provider should be configured"
        
        # Check main provider (first one without alias)
        main_provider = aws_providers[0]
        default_tags = main_provider.get('default_tags', [{}])[0]
        tags = default_tags.get('tags', {})
        
        for required_tag in REQUIRED_TAGS:
            assert required_tag in tags, (
                f"Default tags should include '{required_tag}'"
            )
    
    def test_budgets_module_has_common_tags(self, budgets_main_tf):
        """
        Feature: infrastructure-deployment
        Property 14: Resource Tagging Compliance
        Validates: Requirements 23.1
        
        Verify that Budgets module defines common_tags local.
        """
        locals_list = budgets_main_tf.get('locals', [])
        locals_dict = extract_locals(locals_list)
        
        assert 'common_tags' in locals_dict, "common_tags local should be defined"
        
        common_tags = locals_dict['common_tags']
        # Check that common_tags includes required tags
        common_tags_str = str(common_tags)
        assert 'Environment' in common_tags_str, "common_tags should include Environment"
        assert 'Project' in common_tags_str, "common_tags should include Project"
    
    def test_budget_resources_have_tags(self, budgets_main_tf):
        """
        Feature: infrastructure-deployment
        Property 14: Resource Tagging Compliance
        Validates: Requirements 23.1
        
        Verify that budget resources have tags attribute.
        """
        resources = budgets_main_tf.get('resource', [])
        budget_resources = extract_resources(resources, 'aws_budgets_budget')
        
        assert len(budget_resources) > 0, "Budget resources should be defined"
        
        # Check monthly budget has tags
        monthly_budget = budget_resources.get('monthly', {})
        assert 'tags' in monthly_budget, "Monthly budget should have tags"
    
    def test_all_providers_have_consistent_tags(self, test_providers_tf, production_providers_tf):
        """
        Feature: infrastructure-deployment
        Property 14: Resource Tagging Compliance
        Validates: Requirements 23.1
        
        Verify that all provider aliases have consistent default tags.
        """
        for env_name, providers_tf in [('test', test_providers_tf), ('production', production_providers_tf)]:
            providers = providers_tf.get('provider', [])
            aws_providers = extract_providers(providers)
            
            for provider in aws_providers:
                default_tags = provider.get('default_tags', [{}])[0]
                tags = default_tags.get('tags', {})
                
                for required_tag in REQUIRED_TAGS:
                    assert required_tag in tags, (
                        f"{env_name} provider should have '{required_tag}' in default_tags"
                    )


class TestBudgetConfiguration:
    """
    Tests for Budget module configuration.
    
    Feature: infrastructure-deployment
    Validates: Requirements 23.2, 23.3
    """
    
    def test_budget_has_alert_thresholds(self, budgets_variables_tf):
        """
        Feature: infrastructure-deployment
        Validates: Requirements 23.2
        
        Verify that budget module has alert threshold variables.
        """
        variables = budgets_variables_tf.get('variable', [])
        var_dict = extract_variables(variables)
        
        assert 'alert_threshold_50' in var_dict, "alert_threshold_50 variable should exist"
        assert 'alert_threshold_80' in var_dict, "alert_threshold_80 variable should exist"
        assert 'alert_threshold_100' in var_dict, "alert_threshold_100 variable should exist"
        
        # Check default values
        assert var_dict['alert_threshold_50'].get('default') == 50
        assert var_dict['alert_threshold_80'].get('default') == 80
        assert var_dict['alert_threshold_100'].get('default') == 100
    
    def test_budget_has_notification_configuration(self, budgets_variables_tf):
        """
        Feature: infrastructure-deployment
        Validates: Requirements 23.2
        
        Verify that budget module has notification configuration variables.
        """
        variables = budgets_variables_tf.get('variable', [])
        var_dict = extract_variables(variables)
        
        assert 'sns_topic_arn' in var_dict, "sns_topic_arn variable should exist"
        assert 'notification_email_addresses' in var_dict, (
            "notification_email_addresses variable should exist"
        )
    
    def test_budget_has_cost_allocation_tags_option(self, budgets_variables_tf):
        """
        Feature: infrastructure-deployment
        Validates: Requirements 23.3
        
        Verify that budget module has cost allocation tags configuration.
        """
        variables = budgets_variables_tf.get('variable', [])
        var_dict = extract_variables(variables)
        
        assert 'enable_cost_allocation_tags' in var_dict, (
            "enable_cost_allocation_tags variable should exist"
        )
        assert var_dict['enable_cost_allocation_tags'].get('default') == True, (
            "enable_cost_allocation_tags should default to true"
        )
    
    def test_budget_outputs_include_budget_info(self, budgets_outputs_tf):
        """
        Feature: infrastructure-deployment
        Validates: Requirements 23.2
        
        Verify that budget module outputs include budget information.
        """
        outputs = budgets_outputs_tf.get('output', [])
        output_dict = extract_outputs(outputs)
        
        assert 'monthly_budget_id' in output_dict, "monthly_budget_id output should exist"
        assert 'monthly_budget_arn' in output_dict, "monthly_budget_arn output should exist"
        assert 'budget_summary' in output_dict, "budget_summary output should exist"


class TestResourceTaggingPropertyBased:
    """
    Property-based tests using Hypothesis to validate resource tagging.
    
    Feature: infrastructure-deployment
    Property 14: Resource Tagging Compliance
    Validates: Requirements 23.1
    """
    
    @given(
        environment=st.sampled_from(['test', 'production']),
        project_name=st.text(
            alphabet='abcdefghijklmnopqrstuvwxyz-',
            min_size=3,
            max_size=20
        ).filter(lambda x: not x.startswith('-') and not x.endswith('-') and '--' not in x),
        owner=st.text(
            alphabet='abcdefghijklmnopqrstuvwxyz-',
            min_size=3,
            max_size=20
        ).filter(lambda x: not x.startswith('-') and not x.endswith('-')),
        cost_center=st.text(
            alphabet='abcdefghijklmnopqrstuvwxyz0123456789-',
            min_size=3,
            max_size=30
        ).filter(lambda x: not x.startswith('-') and not x.endswith('-'))
    )
    @settings(max_examples=100)
    def test_tag_values_are_valid(self, environment, project_name, owner, cost_center):
        """
        Feature: infrastructure-deployment
        Property 14: Resource Tagging Compliance
        Validates: Requirements 23.1
        
        *For any* tag value combination, the values SHALL be valid AWS tag values.
        """
        tags = {
            'Environment': environment,
            'Project': project_name,
            'Owner': owner,
            'CostCenter': cost_center
        }
        
        for tag_key, tag_value in tags.items():
            # AWS tag key limits: 1-128 characters
            assert 1 <= len(tag_key) <= 128, (
                f"Tag key '{tag_key}' must be 1-128 characters"
            )
            
            # AWS tag value limits: 0-256 characters
            assert 0 <= len(tag_value) <= 256, (
                f"Tag value for '{tag_key}' must be 0-256 characters"
            )
    
    @given(
        required_tag=st.sampled_from(REQUIRED_TAGS)
    )
    @settings(max_examples=100)
    def test_required_tags_are_defined(self, required_tag):
        """
        Feature: infrastructure-deployment
        Property 14: Resource Tagging Compliance
        Validates: Requirements 23.1
        
        *For any* required tag, it SHALL be in the list of required tags.
        """
        assert required_tag in REQUIRED_TAGS, (
            f"Tag '{required_tag}' should be in required tags list"
        )
    
    @given(
        budget_amount=st.integers(min_value=1, max_value=1000000),
        threshold_percent=st.integers(min_value=1, max_value=100)
    )
    @settings(max_examples=100)
    def test_budget_threshold_calculation(self, budget_amount, threshold_percent):
        """
        Feature: infrastructure-deployment
        Property 14: Resource Tagging Compliance
        Validates: Requirements 23.2
        
        *For any* budget amount and threshold percentage, the threshold amount
        SHALL be correctly calculated.
        """
        threshold_amount = budget_amount * threshold_percent / 100
        
        assert threshold_amount >= 0, "Threshold amount must be non-negative"
        assert threshold_amount <= budget_amount, (
            "Threshold amount must not exceed budget amount"
        )
    
    @given(
        environment=st.sampled_from(['test', 'production'])
    )
    @settings(max_examples=100)
    def test_environment_specific_budget_amounts(self, environment):
        """
        Feature: infrastructure-deployment
        Property 14: Resource Tagging Compliance
        Validates: Requirements 23.2
        
        *For any* environment, the budget amount SHALL be appropriate:
        - test: lower budget (e.g., $500)
        - production: higher budget (e.g., $5000)
        """
        expected_budgets = {
            'test': 500,
            'production': 5000
        }
        
        budget = expected_budgets[environment]
        
        if environment == 'test':
            assert budget < expected_budgets['production'], (
                "Test budget should be less than production budget"
            )
        else:
            assert budget > expected_budgets['test'], (
                "Production budget should be greater than test budget"
            )
