// $ deno run --allow-net --allow-env ./generate-changelog.ts > CHANGELOG.md
import {
  difference,
  format,
  parse,
} from "https://deno.land/std@0.160.0/datetime/mod.ts";

type JSONValue = string | number | boolean | JSONObject | Array<JSONValue>;

interface JSONObject {
  [x: string]: JSONValue;
}

interface PullRequest {
  title: string;
  user: string;
  repo: string;
  url: string;
  mergedAt: string;
}

interface Repo {
  name: string;
  defaultBranch: string;
}

const org = "verygoodopensource";

const now = new Date();
const token = Deno.env.get("CHANGELOG_GITHUB_TOKEN");

const headers = { Authorization: `Bearer ${token}` };

const githubApi = "https://api.github.com";

const repositories = await getRepositories(org);
const pullRequests = await getPullRequests(org, repositories);
const today = format(now, "MM-dd-yyyy");

console.log(`# Very Good Changelog (${today})`);

for (const repo of repositories) {
  const repoPullRequests = pullRequests[repo.name];
  if (repoPullRequests.length === 0) continue;
  console.log(`\n## ${repo.name}`);
  for (const issue of repoPullRequests) {
    console.log(`- ${issue.title} ([@${issue.user}](https://github.com/${issue.user}))`);
    console.log(`\t- ${issue.url}`);
  }
}

async function getPullRequests(
  org: string,
  repos: Array<Repo>
): Promise<{ [repo: string]: Array<PullRequest> }> {
  const pullRequests: { [repo: string]: Array<PullRequest> } = {};
  for (const repo of repos) {
    pullRequests[repo.name] = [];
  }
  for (const repo of repos) {
    pullRequests[repo.name].push(...await getMorePullRequests(org, repo));
  }

  return pullRequests;
}

async function getMorePullRequests(org: string, repo: Repo, page: number = 1): Promise<PullRequest[]> {
  const url = `${githubApi}/repos/${org}/${repo.name}/pulls?state=closed&sort=updated&per_page=100&base=${repo.defaultBranch}&page=${page}&direction=desc`;
  let pullRequests: PullRequest[] = [];
  const response = await fetch(`${url}`, {
    headers: headers,
  });

  if (response.status != 200) {
    throw new Error(`[ERROR] GET ${url} (${response.status})`);
  }

  const body = (await response.json()) as Array<JSONObject>;

  let findMore = true;
  for (var element of body) {
    const title = element["title"] as string;
    const url = element["html_url"] as string;
    const mergedAt = element["merged_at"] as string;
    const user = (element["user"] as JSONObject)["login"] as string;

    // Skip non-merged ones.
    if (!mergedAt) continue;
    
    // Ignoring bot users.
    if (user.includes("[bot]")) continue;

    const diff = difference(parse(mergedAt, "yyyy-MM-ddTHH:mm:ssZ"), now);
    findMore = (diff.weeks ?? 0) <= 1;

    // Too old, rest will be older so lets break.
    if (!findMore) break;

    pullRequests.push({
      title,
      user,
      url,
      mergedAt,
      repo: repo.name,
    });
  }

  if (findMore) {
    pullRequests.push(...await getMorePullRequests(org, repo, ++page));
  }
  
  return pullRequests;
}

async function getRepositories(org: string): Promise<Repo[]> {
  const url = `${githubApi}/orgs/${org}/repos?sort=updated&per_page=100`;
  const response = await fetch(`${url}`, {
    headers: headers,
  });

  if (response.status != 200) {
    throw new Error(`[ERROR] GET ${url} (${response.status})`);
  }

  const body = (await response.json()) as Array<JSONObject>;

  return body
    .filter((element) => {
      const pushedAt = element["pushed_at"] as string;
      const diff = difference(parse(pushedAt, "yyyy-MM-ddTHH:mm:ssZ"), now);
      return (diff.weeks ?? 0) <= 1 && !['changelogs', '.github'].includes(element['name'] as string);
    })
    .map((element) => {
      return {
        name: element['name'] as string,
        defaultBranch: element['default_branch'] as string,
      };
    });
}