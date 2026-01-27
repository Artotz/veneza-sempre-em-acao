// import { useMemo } from "react";
// import { useTranslation } from "react-i18next";
// import { signOut } from "firebase/auth";
// import backgroundImage from "../assets/background.png";
// import { Header } from "../components/Header";
// import { useAuth } from "../contexts/AuthContext";
// import { auth } from "../lib/firebase";
// import { formatSellerName } from "../utils/formatSellerName";
// import cscIcon from "../assets/csc_logo.png";
// import logoJd from "../assets/logo_jd.png";
// import venezaEquip from "../assets/veneza_equip.png";

// export default function GarantiaPage() {
//   const { user } = useAuth();
//   const { t } = useTranslation();

//   const sellerName = useMemo(
//     () => formatSellerName(user?.email ?? null, t("common.notProvided")),
//     [t, user?.email]
//   );

//   const links = useMemo(
//     () => [
//       { to: "/", label: "Plano de Manutenção" },
//       { to: "/garantia", label: "Garantia Estendida" },
//     ],
//     []
//   );

//   return (
//     <main
//       className="relative min-h-screen w-screen overflow-y-scroll overflow-x-hidden no-scrollbar bg-background text-foreground flex flex-col
//              before:fixed before:inset-0 before:bg-black/50 before:z-0 before:pointer-events-none"
//       style={{
//         backgroundImage: `url(${backgroundImage})`,
//         backgroundSize: "cover",
//         backgroundPosition: "center",
//         backgroundRepeat: "no-repeat",
//       }}
//     >
//       <div className="relative z-10 min-h-screen flex flex-col">
//         <Header
//           title="Garantia Estendida"
//           sellerName={sellerName}
//           links={links}
//           signOutLabel={t("header.signOut")}
//           onSignOut={() => signOut(auth)}
//         />

//         <section className="mx-auto max-w-4xl px-4 py-16 flex-1 w-full flex items-center justify-center">
//           <div className="rounded-2xl border border-border bg-surface/80 backdrop-blur p-10 text-center shadow-xl">
//             <p className="text-3xl font-semibold text-foreground">Vem ai...</p>
//             <p className="text-sm text-muted-foreground mt-3">
//               Em breve você poderá realizar a Garantia Estendida aqui.
//             </p>
//           </div>
//         </section>

//         <div className="mt-3 px-4 pb-3 flex flex-row items-center w-full justify-between ">
//           <div className="px-4 flex flex-row justify-end">
//             <img src={cscIcon} alt="CSC" className="h-12 w-auto drop-shadow" />
//           </div>
//           <div className="px-4 flex flex-row justify-end">
//             <img
//               src={venezaEquip}
//               alt="Veneza Equipamentos"
//               className="h-8 w-auto drop-shadow"
//             />
//             <div className="bg-white h-fit">
//               <img src={logoJd} alt="John Deere" className="h-8 w-auto" />
//             </div>
//           </div>
//         </div>
//       </div>
//     </main>
//   );
// }
