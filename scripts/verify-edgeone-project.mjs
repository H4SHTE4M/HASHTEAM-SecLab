#!/usr/bin/env node
import process from 'node:process'

const API_ENDPOINT = 'https://pages-api.cloud.tencent.com/v1'

function fail(message) {
  throw new Error(message)
}

const token = process.env.EDGEONE_API_TOKEN?.trim()
const expectedName = process.env.EDGEONE_PROJECT_NAME?.trim()
const expectedId = process.env.EDGEONE_PROJECT_ID?.trim()

if (!token) fail('缺少 EDGEONE_API_TOKEN')
if (!/^[A-Za-z0-9_-]{1,64}$/.test(expectedName ?? '')) {
  fail('EDGEONE_PROJECT_NAME 格式无效')
}
if (!/^makers-[a-z0-9]+$/.test(expectedId ?? '')) {
  fail('EDGEONE_PROJECT_ID 格式无效')
}

let response
try {
  response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Action: 'DescribePagesProjects',
      Filters: [{ Name: 'Name', Values: [expectedName] }],
      Offset: 0,
      Limit: 10,
      OrderBy: 'CreatedOn',
    }),
    signal: AbortSignal.timeout(15_000),
  })
} catch (error) {
  fail(`无法查询 EdgeOne Makers 项目：${error.message}`)
}

let payload
try {
  payload = await response.json()
} catch {
  fail(`EdgeOne Makers 项目查询返回非 JSON 响应（HTTP ${response.status}）`)
}
if (!response.ok) {
  fail(`EdgeOne Makers 项目查询失败（HTTP ${response.status}）`)
}

const result = payload?.Data?.Response ?? payload?.Response ?? payload
if (
  result?.Error ||
  (result?.Code !== undefined && result.Code !== 0 && result.Code !== '0')
) {
  fail('EdgeOne Makers API 拒绝了项目查询')
}
if (!Array.isArray(result?.Projects)) {
  fail('EdgeOne Makers 项目查询响应结构不符合预期')
}

const matchingProjects = result.Projects.filter(
  (project) => project?.Name === expectedName,
)
if (matchingProjects.length !== 1) {
  fail(`项目名 ${expectedName} 的精确匹配数量不是 1，拒绝继续部署`)
}
const project = matchingProjects[0]
if (project.ProjectId !== expectedId) {
  fail(
    `项目 ${expectedName} 的 ID 为 ${project.ProjectId ?? 'unknown'}，与固定 ID 不匹配`,
  )
}
if (project.Provider !== 'Upload') {
  fail(`项目 ${expectedName} 不是 Direct Upload 项目`)
}
if (project.Status !== undefined && project.Status !== 'Normal') {
  fail(`项目 ${expectedName} 当前状态不是 Normal`)
}

console.log(
  `✓ EdgeOne Makers 项目匹配：${project.Name} (${project.ProjectId}, Direct Upload)`,
)
