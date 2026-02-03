export interface ReleaseInput {
  tagName: string;
  previousTag?: string;
  releaseBody?: string;
  commits: Array<{
    sha: string;
    message: string;
    author: string;
  }>;
  pullRequests: Array<{
    number: number;
    title: string;
    body?: string;
    labels: string[];
    author: string;
  }>;
  repoConfig: {
    companyName?: string;
    productName?: string;
    customerTone?: string;
  };
}

export interface GeneratedNotes {
  customer: string;
  developer: string;
  stakeholder: string;
  tokensUsed: number;
  model: string;
}
