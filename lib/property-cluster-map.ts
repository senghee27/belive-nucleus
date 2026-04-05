export const PROPERTY_CLUSTER_MAP: Record<string, string> = {
  'epic': 'C1', 'bayu angkasa': 'C1', 'bora residence': 'C1', 'medini signature': 'C1', 'austin regency': 'C1', 'marina residence': 'C1',
  'fairview': 'C2', 'vertu resort': 'C2', 'utropolis': 'C2', 'sinaran': 'C2', 'vivo': 'C2', 'rubica': 'C2',
  'youth city': 'C3', 'vision city': 'C3', 'acacia': 'C3',
  'astoria': 'C4', 'platinum splendor': 'C4', 'mh platinum': 'C4', 'm adora': 'C4', 'sunway avila': 'C4', 'neu suites': 'C4',
  'perla': 'C5', 'aratre': 'C5', 'ara tre': 'C5', '121 residence': 'C5',
  'azure': 'C6', 'sunway serene': 'C6', 'emporis': 'C6', 'sapphire paradigm': 'C6', 'armani soho': 'C6', 'highpark': 'C6', 'icon city': 'C6',
  'meta city': 'C7', '7 tree': 'C7', 'netizen': 'C7',
  'rica residence': 'C8', 'the birch': 'C8', 'birch': 'C8', 'duta park': 'C8', 'unio residence': 'C8', 'unio': 'C8',
  'arte cheras': 'C9', 'trion': 'C9', 'razak city': 'C9', 'the ooak': 'C9', 'ooak': 'C9', 'majestic maxim': 'C9', 'one cochrane': 'C9', 'parc3': 'C9', 'nexus': 'C9',
  'secoya': 'C10', 'riveria': 'C10', 'pixel city': 'C10', 'inwood': 'C10', 'the harmony': 'C10', 'harmony': 'C10', 'riamas': 'C10', 'the andes': 'C10', 'andes': 'C10', 'skyline': 'C10',
  'm vertica': 'C11', 'vertica': 'C11',
}

export function mapPropertyToCluster(propertyName: string): string | null {
  const lower = propertyName.toLowerCase()
  for (const [keyword, cluster] of Object.entries(PROPERTY_CLUSTER_MAP)) {
    if (lower.includes(keyword)) return cluster
  }
  return null
}
