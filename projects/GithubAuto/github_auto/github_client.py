from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


class GitHubAPIError(RuntimeError):
    """Raised when the GitHub REST API returns an error."""


@dataclass(frozen=True)
class RemoteRepository:
    owner: str
    name: str
    clone_url: str
    html_url: str
    private: bool


class GitHubClient:
    """
    Minimal GitHub REST API client.

    It is intentionally small and uses Python's standard library so the project
    does not need a large GitHub SDK.
    """

    API_ROOT = "https://api.github.com"

    def __init__(
        self,
        token: str | None,
        owner: str | None,
        timeout_seconds: int,
    ) -> None:
        self.token = (token or "").strip()
        self.owner = (owner or "").strip()
        self.timeout_seconds = timeout_seconds
        self._authenticated_login: str | None = None

    def is_configured(self) -> bool:
        """Repository creation requires a GitHub token."""
        return bool(self.token)

    def authenticated_login(self) -> str:
        """Return the login associated with GITHUB_TOKEN."""
        if self._authenticated_login:
            return self._authenticated_login

        data = self._request("GET", "/user")
        login = str(data.get("login", "")).strip()
        if not login:
            raise GitHubAPIError("GitHub did not return an authenticated username.")

        self._authenticated_login = login
        return login

    def create_or_get_repository(
        self,
        name: str,
        visibility: str,
    ) -> tuple[RemoteRepository, bool]:
        """
        Create a GitHub repository.

        Returns:
            (repository, created_now)

        If a repository with the same name already exists under the target
        owner, the existing repository is returned instead of creating a second
        one.
        """
        if not self.is_configured():
            raise GitHubAPIError(
                "GITHUB_TOKEN is empty. A token is required to create a new "
                "repository on GitHub."
            )

        authenticated_user = self.authenticated_login()
        target_owner = self.owner or authenticated_user
        private = visibility == "private"

        existing = self.get_repository(target_owner, name)
        if existing is not None:
            return existing, False

        payload = {
            "name": name,
            "private": private,
            "auto_init": False,
            "has_issues": True,
            "has_projects": True,
            "has_wiki": True,
        }

        if target_owner == authenticated_user:
            data = self._request("POST", "/user/repos", payload)
        else:
            data = self._request(
                "POST",
                f"/orgs/{target_owner}/repos",
                payload,
            )

        return self._to_repository(data), True

    def get_repository(
        self,
        owner: str,
        name: str,
    ) -> RemoteRepository | None:
        """Return a repository when it exists and is accessible."""
        try:
            data = self._request("GET", f"/repos/{owner}/{name}")
        except GitHubAPIError as exc:
            if "HTTP 404" in str(exc):
                return None
            raise

        return self._to_repository(data)

    def _request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Perform one authenticated GitHub REST request."""
        url = f"{self.API_ROOT}{path}"
        body = None

        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "GithubAuto",
        }

        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"

        request = urllib.request.Request(
            url=url,
            data=body,
            headers=headers,
            method=method,
        )

        try:
            with urllib.request.urlopen(
                request,
                timeout=self.timeout_seconds,
            ) as response:
                raw = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            details = exc.read().decode("utf-8", errors="replace")
            try:
                message = json.loads(details).get("message", details)
            except json.JSONDecodeError:
                message = details
            raise GitHubAPIError(
                f"GitHub API HTTP {exc.code}: {message}"
            ) from exc
        except urllib.error.URLError as exc:
            raise GitHubAPIError(f"Could not reach GitHub API: {exc.reason}") from exc

        if not raw:
            return {}

        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            raise GitHubAPIError("GitHub returned invalid JSON.") from exc

    @staticmethod
    def _to_repository(data: dict[str, Any]) -> RemoteRepository:
        """Convert GitHub API JSON to the small object used by this project."""
        owner_data = data.get("owner") or {}
        return RemoteRepository(
            owner=str(owner_data.get("login", "")),
            name=str(data.get("name", "")),
            clone_url=str(data.get("clone_url", "")),
            html_url=str(data.get("html_url", "")),
            private=bool(data.get("private", True)),
        )
