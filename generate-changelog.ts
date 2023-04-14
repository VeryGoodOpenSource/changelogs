// $ deno run --allow-net --allow-env ./index.ts > CHANGELOG.md

import {
    difference,
    format,
    parse,
  } from "https://deno.land/std@0.160.0/datetime/mod.ts";
  
  type JSONValue = string | number | boolean | JSONObject | Array<JSONValue>;
  
  interface JSONObject {
    [x: string]: JSONValue;
  }
  
  interface Issue {
    title: string;
    user: string;
    repo: string;
    url: string;
    closedAt: string;
  }
  
  const org = "verygoodopensource";
  
  const token = Deno.env.get("GITHUB_TOKEN");
  
  const headers = { Authorization: `Bearer ${token}` };
  
  const githubApi = "https://api.github.com";
  
  const repositories = await getRepositories(org);
  const issues = await getIssues(org, repositories);
  const today = format(new Date(), "MM-dd-yyyy");
  
  console.log(`# Very Good Changelog (${today})`);
  
  for (const repo of repositories) {
    const repoIssues = issues[repo];
    if (repoIssues.length === 0) continue;
    console.log(`\n## ${repo}`);
    for (const issue of repoIssues) {
      console.log(`- ${issue.title} (@${issue.user})`);
      console.log(`\t- ${issue.url}`);
    }
  }
  
  async function getIssues(
    org: string,
    repos: Array<string>
  ): Promise<{ [repo: string]: Array<Issue> }> {
    const now = new Date();
    const lastWeek = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 7
    );
    const since = format(lastWeek, "yyyy-MM-dd");
    const issues: { [repo: string]: Array<Issue> } = {};
    for (const repo of repos) {
      issues[repo] = [];
    }
    for (const repo of repos) {
      const url = `${githubApi}/repos/${org}/${repo}/issues?state=closed&sort=updated&since=${since}&per_page=100`;
      const response = await fetch(`${url}`, {
        headers: headers,
      });
  
      if (response.status != 200) {
        throw new Error(`[ERROR] GET ${url} (${response.status})`);
      }
  
      const body = (await response.json()) as Array<JSONObject>;
  
      issues[repo].push(
        ...body
          .map((element) => {
            const title = element["title"] as string;
            const url = element["url"] as string;
            const closedAt = element["closed_at"] as string;
            const user = (element["user"] as JSONObject)["login"] as string;
            return {
              title,
              user,
              url,
              closedAt,
              repo,
            };
          })
          .filter((issue) => !issue.user.includes("[bot]"))
      );
    }
  
    return issues;
  }
  
  async function getRepositories(org: string): Promise<Array<string>> {
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
        const updatedAt = element["updated_at"] as string;
        const diff = difference(
          parse(updatedAt, "yyyy-MM-ddTHH:mm:ssZ"),
          new Date()
        );
        return diff.weeks ?? 0 <= 1;
      })
      .map((element) => element["name"] as string);
  }