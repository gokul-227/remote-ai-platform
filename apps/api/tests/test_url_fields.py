"""User-supplied links must be http(s): anything else (javascript:, data:, ...)
is rejected at the API so it can never reach an href or img src."""

import pytest
from pydantic import ValidationError

from app.domains.companies.schemas import CompanyProfileCreate, CompanyProfileUpdate
from app.domains.engineers.schemas import EngineerProfileCreate, EngineerProfileUpdate
from app.domains.social.schemas import PostCreate

BAD = ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>x</script>", "vbscript:x", "ftp://x.org/f"]


@pytest.mark.parametrize("value", BAD)
def test_non_http_links_are_rejected(value):
    for build in (
        lambda: PostCreate(content="hi", link_url=value),
        lambda: PostCreate(content="hi", image_url=value),
        lambda: CompanyProfileCreate(name="Org", website=value),
        lambda: CompanyProfileUpdate(logo_url=value),
        lambda: EngineerProfileCreate(portfolio_url=value),
        lambda: EngineerProfileUpdate(linkedin_url=value),
        lambda: EngineerProfileUpdate(projects=[{"title": "t", "description": "d", "url": value}]),
    ):
        with pytest.raises(ValidationError):
            build()


def test_http_links_pass_and_bare_domains_get_https():
    assert PostCreate(content="hi", link_url="https://example.com/a?b=1").link_url == "https://example.com/a?b=1"
    assert CompanyProfileCreate(name="Org", website="example.com").website == "https://example.com"
    assert EngineerProfileUpdate(github_url="  http://github.com/x ").github_url == "http://github.com/x"
    assert CompanyProfileUpdate(website="").website is None
    assert CompanyProfileUpdate(website=None).website is None
