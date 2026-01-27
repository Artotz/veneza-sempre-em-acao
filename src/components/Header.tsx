import { useState } from "react";
import { NavLink } from "react-router-dom";
import logoApp from "../assets/logo.svg";

type HeaderLink = { to: string; label: string; disabled?: boolean };

type HeaderProps = {
  title: string;
  sellerName?: string | null;
  links: HeaderLink[];
  signOutLabel: string;
  onSignOut: () => void;
};

export function Header({
  title,
  sellerName,
  links,
  signOutLabel,
  onSignOut,
}: HeaderProps) {
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const closeMenu = () => setOpen(false);
  const closeAccountMenu = () => setAccountOpen(false);

  const accountLinks: HeaderLink[] = [
    { to: "/perfil", label: "Perfil" },
    { to: "/alteracoes", label: "Registro de Alterações" },
  ];

  const linkBase =
    "rounded-lg border border-transparent px-3 py-1.5 text-sm font-semibold transition-colors";
  const menuItemBase =
    "w-full rounded-lg border border-border-strong px-3 py-2 text-left text-sm font-semibold transition-colors";
  const menuItemIdle =
    "bg-surface-muted hover:bg-foreground active:bg-foreground hover:text-surface active:text-surface";
  const menuItemActive = "bg-foreground text-surface";

  return (
    <header className="fixed top-0 z-30 w-full bg-surface/70 backdrop-blur border-b border-border">
      <div className="mx-auto max-w-7xl px-4 py-1 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={logoApp}
            alt="Veneza Equipamentos"
            className="h-10 w-auto"
          />
          <span className="text-xl font-semibold text-label-text ml-4 sm:ml-0">
            {title}
          </span>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <div className="hidden sm:flex items-center gap-3">
            {links.map((link) =>
              link.disabled ? (
                <span
                  key={link.to}
                  className={`${linkBase} opacity-60 cursor-not-allowed`}
                  aria-disabled="true"
                >
                  {link.label}
                </span>
              ) : (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    `${linkBase} ${
                      isActive
                        ? "border-border-strong bg-surface-muted text-foreground"
                        : "hover:bg-surface-muted"
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              )
            )}
            {sellerName ? (
              <span className="text-label-text hidden sm:inline ml-8">
                {sellerName}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setAccountOpen((value) => !value)}
              className="rounded-lg border border-border-strong h-10 w-10 bg-surface-muted hover:bg-foreground active:bg-foreground hover:text-surface active:text-surface flex items-center justify-center"
              aria-label="Abrir menu de usuario"
              aria-expanded={accountOpen}
              aria-controls="menu-conta"
            >
              <span className="flex flex-col gap-0.5">
                <span className="block h-0.5 w-4 bg-current" />
                <span className="block h-0.5 w-4 bg-current" />
                <span className="block h-0.5 w-4 bg-current" />
              </span>
            </button>
          </div>

          <button
            type="button"
            className="sm:hidden rounded-lg border border-border-strong px-3 py-1.5 bg-surface-muted hover:bg-foreground active:bg-foreground hover:text-surface active:text-surface flex items-center gap-2"
            onClick={() => setOpen((v) => !v)}
            aria-label="Abrir menu"
            aria-expanded={open}
            aria-controls="menu-mobile"
          >
            {/* <span className="font-semibold">Menu</span> */}
            <span className="flex flex-col py-1 justify-center gap-0.5">
              <span className="block h-0.5 w-4 bg-current" />
              <span className="block h-0.5 w-4 bg-current" />
              <span className="block h-0.5 w-4 bg-current" />
            </span>
          </button>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-40 sm:hidden" onClick={closeMenu}>
          <div
            id="menu-mobile"
            role="dialog"
            aria-modal="true"
            className="absolute left-0 right-0 top-12 border-y border-border bg-surface/70 backdrop-blur px-4 pb-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-col gap-2 pt-3">
              {links.map((link) =>
                link.disabled ? (
                  <span
                    key={link.to}
                    className={`${menuItemBase} bg-surface-muted text-label-text opacity-60 cursor-not-allowed`}
                    aria-disabled="true"
                  >
                    {link.label}
                  </span>
                ) : (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    onClick={closeMenu}
                    className={({ isActive }) =>
                      `${menuItemBase} ${
                        isActive ? menuItemActive : menuItemIdle
                      }`
                    }
                  >
                    {link.label}
                  </NavLink>
                )
              )}
              {/* {sellerName ? (
                <span className="text-label-text px-1">{sellerName}</span>
              ) : null} */}
              <div className="border-t-2 border-border pt-2 flex flex-col gap-2">
                {accountLinks.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    onClick={closeMenu}
                    className={({ isActive }) =>
                      `${menuItemBase} ${
                        isActive ? menuItemActive : menuItemIdle
                      }`
                    }
                  >
                    {link.label}
                  </NavLink>
                ))}
                <button
                  onClick={() => {
                    closeMenu();
                    onSignOut();
                  }}
                  className={`${menuItemBase} ${menuItemIdle}`}
                >
                  {signOutLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {accountOpen ? (
        <div className="fixed inset-0 z-40" onClick={closeAccountMenu}>
          <div
            id="menu-conta"
            role="dialog"
            aria-modal="true"
            className="absolute right-4 top-16 w-56 rounded-xl border border-border bg-surface text-foreground shadow-2xl p-2"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-foreground/70">
              Conta
            </div>
            <div className="flex flex-col gap-2">
              {accountLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={closeAccountMenu}
                  className={({ isActive }) =>
                    `${menuItemBase} ${
                      isActive ? menuItemActive : menuItemIdle
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
              <button
                onClick={() => {
                  closeAccountMenu();
                  onSignOut();
                }}
                className={`${menuItemBase} ${menuItemIdle}`}
              >
                {signOutLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
