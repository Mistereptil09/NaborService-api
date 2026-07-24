export interface ClauseSet {
  key: string;
  titleSuffix?: string;
  clauses: string[];
}

const GENERIC_CLAUSES: string[] = [
  "Les parties s'engagent à réaliser le service décrit ci-dessus conformément aux conditions générales de la plateforme Nabor.",
  "Le prestataire s'engage à exécuter la prestation avec diligence et dans les délais convenus entre les parties.",
  "Le demandeur s'engage à fournir au prestataire les informations et l'accès nécessaires à la bonne exécution du service.",
  'Le paiement est opéré via la plateforme Nabor (points). Aucun paiement direct entre les parties ne doit intervenir en dehors de la plateforme.',
  "En cas de litige, les parties s'engagent à rechercher une résolution amiable via la messagerie de la plateforme avant tout autre recours.",
];

export const CONTRACT_CLAUSES: Record<string, ClauseSet> = {
  generic: {
    key: 'generic',
    clauses: GENERIC_CLAUSES,
  },
  'garde-denfants': {
    key: 'garde-denfants',
    titleSuffix: "Garde d'enfants",
    clauses: [
      ...GENERIC_CLAUSES,
      "Le prestataire déclare être en capacité d'assurer la surveillance d'enfants et s'engage à ne jamais laisser les enfants sans surveillance.",
      "Le demandeur communique au prestataire les coordonnées d'urgence, les consignes de santé (allergies, traitements) et les horaires précis avant le début de la garde.",
      "Toute sortie du domicile avec les enfants doit faire l'objet d'un accord préalable du demandeur.",
    ],
  },
  jardinage: {
    key: 'jardinage',
    titleSuffix: 'Jardinage',
    clauses: [
      ...GENERIC_CLAUSES,
      "Sauf accord contraire, l'outillage est fourni par le demandeur. Le prestataire s'engage à utiliser le matériel avec soin et à signaler toute casse.",
      "L'évacuation des déchets verts est à la charge du demandeur, sauf accord contraire consigné dans la messagerie.",
      'En cas de conditions météorologiques rendant la prestation impossible, celle-ci est reportée sans pénalité pour aucune des parties.',
    ],
  },
  bricolage: {
    key: 'bricolage',
    titleSuffix: 'Bricolage',
    clauses: [
      ...GENERIC_CLAUSES,
      "Le prestataire s'engage à respecter les règles de sécurité élémentaires et à signaler tout risque identifié avant d'intervenir.",
      "Les interventions sur les réseaux électriques, de gaz ou de plomberie sous pression sont exclues du champ de ce contrat d'entraide.",
      'Les fournitures et matériaux sont à la charge du demandeur, sauf accord contraire.',
    ],
  },
  'pret-de-materiel': {
    key: 'pret-de-materiel',
    titleSuffix: 'Prêt de matériel',
    clauses: [
      ...GENERIC_CLAUSES,
      'Un état du matériel est établi contradictoirement entre les parties au moment de la remise et de la restitution (photos recommandées via la messagerie).',
      "L'emprunteur s'engage à restituer le matériel dans l'état où il lui a été remis, à la date convenue.",
      "En cas de casse ou de perte, l'emprunteur s'engage à indemniser le prêteur à hauteur de la valeur d'usage du matériel.",
    ],
  },
};

export function slugifyCategory(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function resolveTemplateKey(categoryNames: string[]): string {
  for (const name of categoryNames) {
    const slug = slugifyCategory(name);
    if (CONTRACT_CLAUSES[slug]) return slug;
  }
  return 'generic';
}
