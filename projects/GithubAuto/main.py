from github_auto.agent import GitHubAutoAgent
from github_auto.config import load_config


def main() -> None:
    """Start the interactive GitHubAuto application."""
    config = load_config()
    app = GitHubAutoAgent(config)
    app.run()


if __name__ == "__main__":
    main()
