from github_auto.agent import GitHubAutoAgent
from github_auto.config import load_config


def print_menu() -> None:
    """Display the small interactive menu."""
    print("\nGitHubAuto")
    print("1. Check and sync all repositories")
    print("2. Check repository status only")
    print("3. Exit")


def main() -> None:
    """Application entry point."""
    config = load_config()
    agent = GitHubAutoAgent(config)

    while True:
        print_menu()
        choice = input("\nChoose an option: ").strip()

        if choice == "1":
            agent.run(sync=True)
        elif choice == "2":
            agent.run(sync=False)
        elif choice == "3":
            print("Goodbye.")
            return
        else:
            print("Please choose 1, 2, or 3.")


if __name__ == "__main__":
    main()
