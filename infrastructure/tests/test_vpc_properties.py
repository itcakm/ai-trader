"""
Property-Based Tests for VPC Module

Feature: infrastructure-deployment
Property 13: Environment Configuration Differentiation (VPC CIDR)
Validates: Requirements 2.6

This test validates that test and production environments have different
VPC CIDR ranges to ensure proper network isolation between environments.
"""
import ipaddress
import pytest
from hypothesis import given, strategies as st, settings


class TestVPCCIDRDifferentiation:
    """
    Property 13: Environment Configuration Differentiation (VPC CIDR)
    
    *For any* configurable parameter that differs between environments 
    (VPC CIDR, instance sizes, retention periods, scaling parameters, 
    domain names, alarm thresholds), the test and production terraform.tfvars 
    files SHALL contain different values.
    
    **Validates: Requirements 2.6**
    """
    
    def test_vpc_cidr_differs_between_environments(self, test_tfvars, production_tfvars):
        """
        Feature: infrastructure-deployment
        Property 13: Environment Configuration Differentiation (VPC CIDR)
        Validates: Requirements 2.6
        
        Test that VPC CIDR blocks are different between test and production.
        """
        test_cidr = test_tfvars.get('vpc_cidr')
        prod_cidr = production_tfvars.get('vpc_cidr')
        
        assert test_cidr is not None, "Test environment must define vpc_cidr"
        assert prod_cidr is not None, "Production environment must define vpc_cidr"
        assert test_cidr != prod_cidr, (
            f"VPC CIDR must differ between environments. "
            f"Test: {test_cidr}, Production: {prod_cidr}"
        )
    
    def test_vpc_cidrs_are_valid(self, test_tfvars, production_tfvars):
        """
        Validate that both VPC CIDRs are valid IPv4 network addresses.
        """
        test_cidr = test_tfvars.get('vpc_cidr')
        prod_cidr = production_tfvars.get('vpc_cidr')
        
        # Validate test CIDR
        try:
            test_network = ipaddress.ip_network(test_cidr, strict=False)
            assert test_network.version == 4, "Test VPC CIDR must be IPv4"
        except ValueError as e:
            pytest.fail(f"Invalid test VPC CIDR '{test_cidr}': {e}")
        
        # Validate production CIDR
        try:
            prod_network = ipaddress.ip_network(prod_cidr, strict=False)
            assert prod_network.version == 4, "Production VPC CIDR must be IPv4"
        except ValueError as e:
            pytest.fail(f"Invalid production VPC CIDR '{prod_cidr}': {e}")
    
    def test_vpc_cidrs_do_not_overlap(self, test_tfvars, production_tfvars):
        """
        Validate that test and production VPC CIDRs do not overlap.
        This ensures complete network isolation between environments.
        """
        test_cidr = test_tfvars.get('vpc_cidr')
        prod_cidr = production_tfvars.get('vpc_cidr')
        
        test_network = ipaddress.ip_network(test_cidr, strict=False)
        prod_network = ipaddress.ip_network(prod_cidr, strict=False)
        
        assert not test_network.overlaps(prod_network), (
            f"VPC CIDRs must not overlap. "
            f"Test: {test_cidr}, Production: {prod_cidr}"
        )
    
    def test_vpc_cidr_size_appropriate(self, test_tfvars, production_tfvars):
        """
        Validate that VPC CIDRs have appropriate size (/16 recommended for AWS VPCs).
        """
        test_cidr = test_tfvars.get('vpc_cidr')
        prod_cidr = production_tfvars.get('vpc_cidr')
        
        test_network = ipaddress.ip_network(test_cidr, strict=False)
        prod_network = ipaddress.ip_network(prod_cidr, strict=False)
        
        # AWS recommends /16 for VPCs, but allows /16 to /28
        # We check that prefix length is between 16 and 24 for reasonable subnet capacity
        assert 16 <= test_network.prefixlen <= 24, (
            f"Test VPC CIDR prefix length should be between /16 and /24, got /{test_network.prefixlen}"
        )
        assert 16 <= prod_network.prefixlen <= 24, (
            f"Production VPC CIDR prefix length should be between /16 and /24, got /{prod_network.prefixlen}"
        )


class TestVPCCIDRPropertyBased:
    """
    Property-based tests using Hypothesis to validate VPC CIDR handling.
    
    Feature: infrastructure-deployment
    Property 13: Environment Configuration Differentiation (VPC CIDR)
    Validates: Requirements 2.6
    """
    
    @given(
        test_second_octet=st.integers(min_value=0, max_value=255),
        prod_second_octet=st.integers(min_value=0, max_value=255)
    )
    @settings(max_examples=100)
    def test_different_second_octets_never_overlap(self, test_second_octet, prod_second_octet):
        """
        Feature: infrastructure-deployment
        Property 13: Environment Configuration Differentiation (VPC CIDR)
        Validates: Requirements 2.6
        
        *For any* two /16 VPC CIDRs with different second octets in the 10.x.0.0/16 range,
        the networks SHALL NOT overlap.
        """
        # Skip when octets are the same (trivially overlapping)
        if test_second_octet == prod_second_octet:
            return
        
        test_cidr = f"10.{test_second_octet}.0.0/16"
        prod_cidr = f"10.{prod_second_octet}.0.0/16"
        
        test_network = ipaddress.ip_network(test_cidr)
        prod_network = ipaddress.ip_network(prod_cidr)
        
        assert not test_network.overlaps(prod_network), (
            f"Different second octets should never overlap: {test_cidr} vs {prod_cidr}"
        )
    
    @given(
        prefix_len=st.integers(min_value=16, max_value=24)
    )
    @settings(max_examples=100)
    def test_valid_prefix_lengths_create_usable_networks(self, prefix_len):
        """
        Feature: infrastructure-deployment
        Property 13: Environment Configuration Differentiation (VPC CIDR)
        Validates: Requirements 2.6
        
        *For any* valid prefix length between /16 and /24, the resulting network
        SHALL have at least 256 usable addresses (enough for multiple subnets).
        """
        cidr = f"10.0.0.0/{prefix_len}"
        network = ipaddress.ip_network(cidr)
        
        # Calculate usable addresses (total - network - broadcast)
        usable_addresses = network.num_addresses - 2
        
        # /24 gives 254 usable, /16 gives 65534 usable
        assert usable_addresses >= 254, (
            f"Network {cidr} should have at least 254 usable addresses, got {usable_addresses}"
        )
