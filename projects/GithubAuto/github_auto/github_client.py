from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


class GitHubAPIError(RuntimeError):
    """Raised when a GitHub REST API operation fails."""

    def __init__(
        self,
        message: str,
        status_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class RemoteRepository:
    owner: str
    name: str
    clone_url: str
    html_url: str
    private: bool


class GitHubClient:
    """
    Minimal GitHub REST client.

    Git operations still use normal Git. This client is only for operations
    that Git itself cannot do, such as creating/deleting a GitHub repository.
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
        self._login: str | None = None

    def is_configured(self) -> bool:
        return bool(self.token)

    def authenticated_login(self) -> str:
        if self._login:
            return self._login

        data = self._request("GET", "/user")
        login = str(data.get("login", "")).strip()

        if not login:
            raise GitHubAPIError(
                "GitHub did not return an authenticated username."
            )

        self._login = login
        return login

    def get_repository(
        self,
        owner: str,
        name: str,
    ) -> RemoteRepository | None:
        owner_q = urllib.parse.quote(owner, safe="")
        name_q = urllib.parse.quote(name, safe="")

        try:
            data = self._request(
                "GET",
                f"/repos/{owner_q}/{name_q}",
            )
        except GitHubAPIError as exc:
            if exc.status_code == 404:
                return None
            raise

        return self._to_repository(data)

    def create_or_get_repository(
        self,
        name: str,
        visibility: str,
    ) -> tuple[RemoteRepository, bool]:
        if not self.is_configured():
            raise GitHubAPIError(
                "GITHUB_TOKEN is required to create a GitHub repository."
            )

        login = self.authenticated_login()
        target_owner = self.owner or login

        existing = self.get_repository(target_owner, name)
        if existing:
            return existing, False

        payload = {
            "name": name,
            "private": visibility == "private",
            "auto_init": False,
        }

        if target_owner == login:
            data = self._request("POST", "/user/repos", payload)
        else:
            owner_q = urllib.parse.quote(target_owner, safe="")
            data = self._request(
                "POST",
                f"/orgs/{owner_q}/repos",
                payload,
            )

        return self._to_repository(data), True

    def delete_repository(
        self,
        owner: str,
        name: str,
    ) -> None:
        """Permanently delete a remote GitHub repository."""
        if not self.is_configured():
            raise GitHubAPIError(
                "GITHUB_TOKEN is required to delete a GitHub repository."
            )

        owner_q = urllib.parse.quote(owner, safe="")
        name_q = urllib.parse.quote(name, safe="")
        self._request(
            "DELETE",
            f"/repos/{owner_q}/{name_q}",
        )

    def _request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
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
                f"GitHub API HTTP {exc.code}: {message}",
                status_code=exc.code,
            ) from exc
        except urllib.error.URLError as exc:
            raise GitHubAPIError(
                f"Could not reach GitHub API: {exc.reason}"
            ) from exc

        if not raw:
            return {}

        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            raise GitHubAPIError(
                "GitHub returned invalid JSON."
            ) from exc

    @staticmethod
    def _to_repository(
        data: dict[str, Any],
    ) -> RemoteRepository:
        owner_data = data.get("owner") or {}
        return RemoteRepository(
            owner=str(owner_data.get("login", "")),
            name=str(data.get("name", "")),
            clone_url=str(data.get("clone_url", "")),
            html_url=str(data.get("html_url", "")),
            private=bool(data.get("private", True)),
        )
