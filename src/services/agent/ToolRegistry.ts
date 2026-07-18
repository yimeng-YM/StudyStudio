import * as readTools from './tools/readTools';
import * as writeTools from './tools/writeTools';
import * as webTools from './tools/webTools';
import { ToolCall } from '@/services/ai';
import { parseToolArguments } from '@/lib/utils';
import { DELEGATE_TASK_DESCRIPTION } from '@/services/promptConfig';

/**
 * 集中注册和管理 AI 可调用的所有前端本地工具。
 * 将声明的函数名称与实际执行的方法实现（分别来自 readTools 和 writeTools）进行映射。
 */
export const ToolRegistry = {
  // 读取工具
  get_subjects: readTools.get_subjects,
  get_subject_details: readTools.get_subject_details,
  get_entity_content: readTools.get_entity_content,
  get_note_lines: readTools.get_note_lines,
  get_quiz_questions: readTools.get_quiz_questions,

  // 联网工具：搜索网络、读取网页全文、维基百科和图片搜索，供模型获取训练数据外的权威/时效信息
  web_search: webTools.web_search,
  read_url: webTools.read_url,
  search_wikipedia: webTools.search_wikipedia,
  search_wikipedia_web: webTools.search_wikipedia_web,
  image_search: webTools.image_search,

  // 写入工具
  create_subject: writeTools.create_subject,
  update_subject: writeTools.update_subject,
  create_mindmap: writeTools.create_mindmap,
  update_mindmap: writeTools.update_mindmap,
  add_mindmap_elements: writeTools.add_mindmap_elements,
  clear_mindmap: writeTools.clear_mindmap,
  create_note: writeTools.create_note,
  update_note: writeTools.update_note,
  patch_note_content: writeTools.patch_note_content,
  append_note_content: writeTools.append_note_content,
  delete_note_section: writeTools.delete_note_section,
  insert_image_into_note: writeTools.insert_image_into_note,
  create_quiz: writeTools.create_quiz,
  update_quiz: writeTools.update_quiz,
  patch_quiz_questions: writeTools.patch_quiz_questions,
  create_taskboard: writeTools.create_taskboard,
  update_taskboard: writeTools.update_taskboard,

  // 流程控制工具，用于在对话中辅助 AI 管理任务流状态
  present_plan: async (_args: { plan_summary: string }) => ({ status: 'success', message: 'Plan presented to user, awaiting confirmation.' }),
  start_execution: async () => ({ status: 'success', message: 'Execution started.' }),

  // 新增工具
  delete_entity: writeTools.delete_entity,
  get_note_outline: readTools.get_note_outline,
  search_in_note: readTools.search_in_note,
  get_note_stats: readTools.get_note_stats,
  update_task_list: async (args: { items?: any[] }) => ({ status: 'ok', itemCount: args.items?.length || 0 }),
  ask_user: async (_args: any) => ({ status: 'pending', message: 'Waiting for user response.' }),
};

/**
 * 统一的工具调用执行器。
 * 接收 AI 生成的结构化工具调用请求，解析参数并路由到对应的本地实现函数。
 * 
 * @param toolCall - 包含函数名称和序列化 JSON 参数的工具调用对象
 * @returns 对应工具函数执行后的返回结果（通常会再转为字符串喂给 AI 形成闭环）
 * @throws 当请求了未在 ToolRegistry 中注册的工具时抛出异常
 */
export async function executeTool(toolCall: ToolCall): Promise<any> {
  const toolName = toolCall?.function?.name;
  if (!toolName) {
    throw new Error('Invalid tool call: missing function name');
  }
  // 宽容解析工具参数：复用 parseAIJson 的清洗 + repairJsonString 容错（剥代码块/注释、
  // 单引号转双引号、裸 key 加引号、去尾随逗号、补全截断的括号），大幅降低长 JSON 解析失败率。
  // 空串兜底为 {} 以兼容无参工具。
  const toolArgs = parseToolArguments(toolCall.function.arguments || '{}');

  const tool = (ToolRegistry as any)[toolName];
  if (!tool) {
    throw new Error(`Tool ${toolName} not found`);
  }

  return await tool(toolArgs);
}

/**
 * 工具使用的最佳实践指南（注入给大模型的提示词片段）。
 * 明确了各个核心内容生成工具在实际调用时应遵循的格式标准和质量下限，
 * 特别强调了内容的丰富度（如题型分布、导图层级、任务节点数量），防止大模型偷懒。
 */
export const TOOL_USAGE_GUIDE = `
## Tool Usage Best Practices

### Core Principle: Prefer Editing Over Creating
**Before creating new content, always check if relevant content already exists:**
1. Call get_subjects to find existing subjects.
2. Call get_subject_details to see existing notes, quizzes, and mindmaps.
3. If matching content exists, UPDATE or PATCH it instead of creating a duplicate.

Creating a new entity is only appropriate when:
- No related entity exists yet.
- The user explicitly asks to create a new, separate document.

### Targeted Editing — Use Patch Tools for Small Changes
For notes and quizzes, prefer surgical edits over full rewrites:

| Situation | Preferred Tool |
|---|---|
| Changing part of a note | patch_note_content |
| Adding a whole new section/paragraph | append_note_content |
| Removing a whole section by heading or line range | delete_note_section |
| Finding where a term occurs in a note | search_in_note |
| Gauging a note's size/structure without full read | get_note_stats |
| Fixing or adding a few questions | patch_quiz_questions |
| Rewriting the majority of a note | update_note |
| Regenerating most questions | update_quiz |

**Workflow for targeted note edits (exact search-replace, no line numbers):**
1. Read the note to get the exact current text — get_entity_content, or more cheaply get_note_outline + get_note_lines for the relevant section. search_in_note finds where a phrase occurs (line+column) without loading the whole note; get_note_stats gives a quick size/structure overview.
2. patch_note_content — copy the exact text to change into "search", put new text in "replace".
   - "search" MUST be a verbatim copy (including all spaces and newlines).
   - If the literal text appears multiple times, the tool REFUSES and returns every match location — add surrounding context to make it unique, or pass line_range={start,end} (same line numbers as get_note_lines/get_note_outline) to narrow the search.
   - On "not found": the error includes a nearest_match (closest line + similarity + the first differing char, expected vs actual) — use it to fix the search text instead of blindly retrying.
   - Risky/large edit? Set dry_run=true first to preview the before/after and affected line range without writing; confirm, then re-call without dry_run.
   - Need a pattern substitution? Set use_regex=true (a 'g' flag is auto-added) and use $1/$2 capture groups in replace; in regex mode multiple matches are all replaced.
3. Appending a brand-new section? Use append_note_content (no search text needed). Deleting a whole section? Use delete_note_section with range={start_line,end_line?} or heading="...".

**Workflow for targeted quiz edits:**
1. get_quiz_questions — inspect the relevant questions by ID or index range.
2. patch_quiz_questions — add / update / delete only those questions.

### Mindmaps — Single Entity per Subject
- Only ONE mindmap can exist per subject. create_mindmap auto-merges into the existing one.
- To expand content: use add_mindmap_elements.
- To rebuild from scratch: use clear_mindmap then update_mindmap (or add_mindmap_elements).
- To replace structure: use update_mindmap with the full desired content.

### Quiz Creation (create_quiz / update_quiz)
Requirements: Generate an extensive set of questions for each quiz bank.
Question Type Distribution:
- Single choice: 40% (4-5 options)
- Multiple choice: 20% (4-5 options)
- True/False: 15%
- Fill-in-the-blanks: 15%
- Short answer: 10%

Each question must include:
- Clear description (supports Markdown)
- Correct answer (index for choice, "true"/"false" for True/False)
- Detailed explanation

### Mindmap Creation (create_mindmap / update_mindmap)
Requirements: Create detailed mindmaps with many nodes.
Structure Recommendations:
- 3-5 levels of hierarchy
- Each branch should have multiple sub-nodes
- Node content should be specific and meaningful

### Note Creation (create_note / update_note)
Requirements: Write extensive and detailed notes.
Structure Recommendations:
- Overview/Introduction
- Core concepts (multiple)
- Detailed sectional content
- Analysis of key and difficult points
- Practical applications/case studies
- Summary and key takeaways

### Images in Notes
Notes render both network image URLs and local attachments via standard Markdown \`![alt](src)\` syntax. Three image sources are available:
- **image_search** — search the live web for a relevant image; use the returned \`imageUrl\` directly.
- **read_url** — when the fetched page contains images, they are extracted into the response's \`images\` array (in addition to the Markdown body); reuse those URLs if relevant to the note.
- **User-uploaded images** (chat attachments) — appear in the conversation as an \`attachment:<id>\` reference; use that exact string as the image source.

To add an image to a note, prefer \`insert_image_into_note(entityId, image_source, alt_text?, anchor_text?)\` — it validates the source and inserts \`![alt](src)\` at the right place (after \`anchor_text\` if given, else appended). You may also embed \`![alt](url)\` directly inside \`content\` when calling create_note/update_note/patch_note_content — both approaches render identically.

### Task Board Creation (create_taskboard / update_taskboard)
Requirements: Include a comprehensive list of task blocks. Each block should have multiple specific task items.
Structure:
- Breakdown the whole goal into 3-5 logical phases.
- Each phase is a "taskBlock" node.
- Each block MUST contain 5-10 items.
- **IMPORTANT**: Each item in "items" MUST be an object: { "id": string, "text": string, "completed": boolean }. NEVER use numbers or strings directly in the items array.
- Ensure logical flow and actionable descriptions.
`;

export const ToolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'get_subjects',
      description: `Retrieve the list of all subjects in the system.
Use this tool to:
- See existing subjects
- Get subject IDs for subsequent operations
- Understand the user's subject structure

Returns: An array of subjects with id, name, description, etc.`,
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_subject_details',
      description: `Retrieve all entities (mindmaps, notes, quizzes, taskboards) for a specific subject.
Use this tool to:
- See what content exists under a subject
- Get entity IDs for detailed operations
- Understand the overall content structure of a subject

Parameters:
- subjectId: ID of the subject (required)

Returns: A list of all entities under the specified subject`,
      parameters: {
        type: 'object',
        properties: {
          subjectId: { type: 'string', description: 'The ID of the subject' }
        },
        required: ['subjectId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_entity_content',
      description: `Retrieve the detailed content of a specific entity (mindmap, note, quiz, or taskboard).
Use this tool to:
- View the details of specific content
- Retrieve entity content for editing or reference
- Understand the full information of an entity

Parameters:
- entityId: ID of the entity (required)

Returns: The complete content of the entity`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the entity' }
        },
        required: ['entityId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_note_lines',
      description: `Read specific lines from a note without fetching the entire content.
Use this tool to:
- Preview a section before making targeted edits
- Check whether certain content already exists at a location
- Save tokens by only loading the portion you need

Parameters:
- entityId: ID of the note entity (required)
- start_line: First line to return, 1-indexed inclusive (required)
- end_line: Last line to return, 1-indexed inclusive (optional, defaults to end of file)

Returns: Selected lines with line-number prefixes, plus total_lines for the full document.`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the note entity' },
          start_line: { type: 'number', description: 'First line number to read (1-indexed)' },
          end_line: { type: 'number', description: 'Last line number to read (1-indexed, inclusive). Omit to read to the end.' }
        },
        required: ['entityId', 'start_line']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_quiz_questions',
      description: `Read specific questions from a quiz bank without fetching all questions.
Use this tool to:
- Inspect a particular set of questions before editing them
- Check for duplicate or outdated content
- Save tokens when the quiz bank is large

Parameters:
- entityId: ID of the quiz entity (required)
- question_ids: Array of question IDs to retrieve (optional)
- start_index: First question to return, 1-indexed inclusive (optional)
- end_index: Last question to return, 1-indexed inclusive (optional)

If none of question_ids / start_index / end_index is provided, all questions are returned.

Returns: Selected questions each annotated with their 1-based index in the full bank, plus total_questions.`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the quiz entity' },
          question_ids: { type: 'array', items: { type: 'string' }, description: 'Specific question IDs to retrieve' },
          start_index: { type: 'number', description: 'First question index to return (1-indexed)' },
          end_index: { type: 'number', description: 'Last question index to return (1-indexed, inclusive)' }
        },
        required: ['entityId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: `Search the live web for up-to-date or authoritative information beyond your training data.
Use this tool to:
- Find current facts, news, recent releases, or knowledge newer than your training cutoff.
- Locate authoritative sources (official docs, papers, encyclopedias, reputable publishers) before answering fact-sensitive questions.
- Discover authoritative URLs that you then read in full with read_url.

Workflow: web_search → pick the most authoritative result URL(s) → read_url each → synthesize the answer and cite the source URL(s).

Parameters:
- query: The search query (required). Use concise, specific keywords; prefer the user's language for better hits.
- max_results: Max number of results to return (optional, default 5, max 10).

Returns: { query, count, results: [{ title, url, snippet }] }. Snippets are short — call read_url on the best URL(s) to get the full content before answering. On 429 (rate limit), wait and retry or rephrase the query. Prefer a few high-quality searches over many noisy ones.`,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query text (concise and specific)' },
          max_results: { type: 'number', description: 'Maximum number of results to return (default 5, max 10)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_url',
      description: `Fetch a web page and return its main content as clean Markdown, ready to read into your context.
Use this tool AFTER web_search to ingest the FULL content of an authoritative URL, or whenever the user gives you a specific link to digest.
When choosing which candidate URL to read, prefer sites that are directly accessible from mainland China — some domains (e.g. the original wikipedia.org, twitter.com/x.com) may fail to fetch or time out in that network; prefer a reachable alternative source when available.

Parameters:
- url: The full URL to read (required). The http(s):// prefix is added automatically if missing.
- max_chars: Optional cap on returned content length (default 16000, max 40000). Increase only if you genuinely need more of a long article.

Returns: { url, title, content, chars, full_chars, truncated, images? }. If truncated is true, the article was longer than what was returned — you may re-call with a larger max_chars, or search for a more focused page. If content is empty, the page may be JS-rendered / paywalled / blocked — try another URL. On 429 (rate limit), wait and retry.
If the page contains images, their URLs are extracted into the "images" array — reuse them (e.g. via insert_image_into_note) when illustrating a note on this topic.

Always CITE the source URL(s) you actually read when the answer relies on web content. Never fabricate URLs.`,
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The full URL of the web page to read' },
          max_chars: { type: 'number', description: 'Optional cap on returned content length (default 16000, max 40000)' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_wikipedia',
      description: `Search Wikipedia for authoritative encyclopedic knowledge. Keyless and CORS-native — always works without any API key.
Use this tool to:
- Look up definitional, encyclopedic, or factual "authoritative" knowledge (concepts, people, events, science, history, terms).
- Get a reliable source to cite when answering fact-sensitive questions, as a complement to web_search.
- Prefer this OVER web_search for encyclopedic / definitional queries (it is authoritative and free).

Parameters:
- query: The search query (required). Use the topic's common name; prefer the language that matches the topic.
- language: Wikipedia language edition (optional, default 'zh'). Use 'en' for broader coverage on technical / academic / international topics — English Wikipedia is far more comprehensive; you then translate the answer to Chinese. Use 'zh' for Chinese-specific topics.
- limit: Max number of entries (optional, default 5, max 10).

Returns: { query, language, count, results: [{ title, url, extract }] }. Each result includes the article URL and a plaintext intro extract (authoritative summary). For the full article, call read_url on the chosen URL (read_url is always available).

Cite the Wikipedia URL(s) you use. Distill content into your own answer — do not dump the raw extract back to the user.`,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query (topic common name)' },
          language: { type: 'string', description: "Wikipedia language edition (default 'zh'; use 'en' for broader coverage on technical/academic topics)" },
          limit: { type: 'number', description: 'Maximum number of entries to return (default 5, max 10)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_wikipedia_web',
      description: `Search Wikipedia through the configured web-search backend, restricted to wikipedia.org.
Runs a \`site:wikipedia.org\` search through the same backend as web_search. Returns Wikipedia article links and snippets. Available automatically whenever web_search is enabled — no separate toggle.

Use this tool to:
- Look up definitional, encyclopedic, or factual "authoritative" knowledge when the original wikipedia.org (search_wikipedia) is blocked / disabled.
- Find the best Wikipedia URL(s), then call read_url on the chosen one to ingest the full article.

Parameters:
- query: The search query (required). Use the topic's common name; the user's language usually yields better-matched Wikipedia editions.
- max_results: Max number of results (optional, default 5, max 10).

Returns: { query, count, results: [{ title, url, snippet, date? }] } (may include knowledgeGraph). Snippets are Google's short summaries of Wikipedia pages. For the full article, call read_url on the best URL. Prefer English Wikipedia URLs if Chinese Wikipedia pages time out via read_url, then translate the answer to Chinese.

Cite the source URL(s) you use. Distill content into your own answer — do not dump the raw snippet back to the user.`,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query (topic common name)' },
          max_results: { type: 'number', description: 'Maximum number of results to return (default 5, max 10)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'image_search',
      description: `Search the live web for images matching a query. Available with the local SearXNG or Serper backend (unavailable with Jina).
Use this tool to:
- Find a relevant, real-world image to illustrate a note (diagram, photo, chart screenshot, etc.).
- Get a direct image URL you can embed in a note via Markdown \`![]()\` or the insert_image_into_note tool.

Parameters:
- query: The search query text (required). Be specific about what the image should show.
- max_results: Maximum number of results to return (optional, default 6, max 10).

Returns: { query, count, results: [{ title, imageUrl, sourceUrl }] }. imageUrl is a direct image link ready to embed; sourceUrl is the page the image was found on (cite it if relevant). On error (e.g. backend unavailable or rate limit), returns { error, query }.`,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The image search query (be specific about the desired image content)' },
          max_results: { type: 'number', description: 'Maximum number of results to return (default 6, max 10)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_subject',
      description: `Create a new subject.
Use this tool to:
- Create a subject container for a new study topic
- Organize related study materials

Parameters:
- name: Name of the subject (required)
- description: Description of the subject (optional)

Best Practice: After creating a subject, immediately create related content (mindmaps, notes, quizzes, etc.) for it.`,
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the subject' },
          description: { type: 'string', description: 'Optional description for the subject' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_subject',
      description: `Update information for an existing subject.
Use this tool to:
- Change the subject name
- Update the subject description`,
      parameters: {
        type: 'object',
        properties: {
          subjectId: { type: 'string', description: 'The ID of the subject to update' },
          name: { type: 'string', description: 'New name for the subject' },
          description: { type: 'string', description: 'New description for the subject' }
        },
        required: ['subjectId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_mindmap',
      description: `Create a mindmap for a subject. Only one mindmap per subject — if one already exists, new content is merged into it.

Important: Generate a detailed mindmap with many nodes for depth.

Node Structure Requirements:
- Root Node: Core concept of the topic
- Level 2 Nodes: Main branches
- Level 3+ Nodes: Sub-categories and specific details

Content Format:
{
  "nodes": [
    { "id": "node1", "type": "input", "data": { "label": "Root Node" }, "position": { "x": 0, "y": 0 } },
    { "id": "node2", "type": "default", "data": { "label": "Child Node Content" }, "position": { "x": 200, "y": 100 } }
  ],
  "edges": [
    { "id": "e1-2", "source": "node1", "target": "node2" }
  ]
}

Parameters:
- subjectId: ID of the subject (required)
- title: Title of the mindmap (required)
- content: Object containing nodes and edges (required)`,
      parameters: {
        type: 'object',
        properties: {
          subjectId: { type: 'string', description: 'The ID of the subject' },
          title: { type: 'string', description: 'Title of the mindmap' },
          content: { 
            type: 'object', 
            description: 'The mindmap content containing React Flow nodes and edges. Should be comprehensive with extensive nodes.',
            properties: {
              nodes: { type: 'array', items: { type: 'object' } },
              edges: { type: 'array', items: { type: 'object' } }
            }
          }
        },
        required: ['subjectId', 'title', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_mindmap',
      description: `Update an existing mindmap.
You can modify the title or update the entire content structure.
Maintain a comprehensive node count when updating.`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the mindmap entity' },
          title: { type: 'string', description: 'New title' },
          content: { 
            type: 'object', 
            description: 'The mindmap content containing React Flow nodes and edges.',
            properties: {
              nodes: { type: 'array', items: { type: 'object' } },
              edges: { type: 'array', items: { type: 'object' } }
            }
          }
        },
        required: ['entityId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_mindmap_elements',
      description: `Add new nodes and edges to an existing mindmap without replacing the entire content.
Use this tool to:
- Expand content on an existing map
- Add new branches or nodes
- Increase content while maintaining the original structure`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the mindmap entity' },
          nodes: {
            type: 'array',
            description: 'Array of React Flow nodes to add.',
            items: { type: 'object' }
          },
          edges: {
            type: 'array',
            description: 'Array of React Flow edges to add.',
            items: { type: 'object' }
          }
        },
        required: ['entityId', 'nodes', 'edges']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'clear_mindmap',
      description: `Remove all nodes and edges from an existing mindmap, leaving an empty canvas.
Use this tool when you want to completely rebuild a mindmap's structure from scratch
without deleting the entity itself (preserving its ID, title, and association with the subject).

After clearing, use update_mindmap or add_mindmap_elements to populate new content.

Parameters:
- entityId: ID of the mindmap entity to clear (required)`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the mindmap entity to clear' }
        },
        required: ['entityId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_note',
      description: `Create a new knowledge note for a subject.

Important: Content must be detailed and extensive.

Content Structure Recommendations:
1. Overview/Introduction
2. Core concept explanations (multiple)
3. Detailed sectional content
4. Analysis of key and difficult points
5. Practical applications/case studies
6. Summary and key takeaways

Content Requirements:
- Use Markdown format
- Include heading hierarchy (#, ##, ###)
- Use lists, tables, and other formatting
- Include specific examples and explanations

Parameters:
- subjectId: ID of the subject (required)
- title: Title of the note (required)
- content: Markdown content of the note (required, should be extensive)`,
      parameters: {
        type: 'object',
        properties: {
          subjectId: { type: 'string', description: 'The ID of the subject' },
          title: { type: 'string', description: 'Title of the note' },
          content: { type: 'string', description: 'The markdown content of the note. MUST be a raw string, NOT an object. Must be comprehensive and detailed.' }
        },
        required: ['subjectId', 'title', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_note',
      description: `Completely replace an existing note's content or title.
Use this only when the changes affect the majority of the document.
For small or targeted edits, prefer patch_note_content (search-replace) instead.`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the note entity' },
          title: { type: 'string', description: 'New title' },
          content: { type: 'string', description: 'The markdown content of the note. MUST be a raw string, NOT an object.' }
        },
        required: ['entityId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'patch_note_content',
      description: `Replace a specific piece of text inside a note using exact search-and-replace — no line numbers needed.

**Always use this instead of update_note** when only part of the note needs to change.

How it works:
- You provide the exact original text you want to replace (search).
- You provide the new text to put in its place (replace).
- The tool finds the exact text and replaces it.

Diagnostics (no more vague "not found"):
- If search is not found, the error includes a "nearest_match": the closest line, a similarity score, and the first differing character (expected vs actual) — use it to fix your search text precisely.
- If the literal search text appears more than once, the tool REFUSES to run and returns ALL match locations (line + preview). Either add surrounding context to make it unique, or pass line_range to narrow the search.

Rules:
1. Read the note first with get_entity_content (or get_note_lines / get_note_outline) to get the exact current text.
2. Copy the text you want to change VERBATIM into search — including all spaces, punctuation, and newlines.
3. The literal search text must be unique in the document (see diagnostics above).
4. Do NOT modify the search string — even one extra space will cause a "not found" error.

Optional parameters:
- line_range: { start, end? } — 1-indexed inclusive line range (same numbering as get_note_lines / get_note_outline) to restrict where search looks. Omit to search the whole note.
- dry_run: true — compute and return the before/after preview and affected line range WITHOUT writing. Confirm, then re-call without dry_run to apply.
- use_regex: true — treat search as a regular expression (a 'g' flag is added automatically); capture groups ($1, $2…) may be used in replace. In regex mode multiple matches are ALL replaced (uniqueness is not required).

Parameters:
- entityId: ID of the note entity (required)
- search: The exact original text to find (or regex source when use_regex=true). (required)
- replace: The new text to put in place of the search text. (required)
- line_range, dry_run, use_regex: see "Optional parameters" above.`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the note entity' },
          search: { type: 'string', description: 'Exact original text to find (or regex source when use_regex=true). Must be copied verbatim from the note — including all whitespace and newlines.' },
          replace: { type: 'string', description: 'New text to substitute in place of the search text (supports $1/$2… when use_regex=true).' },
          line_range: {
            type: 'object',
            description: 'Optional 1-indexed inclusive line range to restrict the search (same numbering as get_note_lines / get_note_outline). Omit to search the whole note.',
            properties: {
              start: { type: 'number', description: 'First line (1-indexed, inclusive)' },
              end: { type: 'number', description: 'Last line (1-indexed, inclusive). Omit to extend to the end of the note.' }
            },
            required: ['start']
          },
          dry_run: { type: 'boolean', description: 'If true, return the before/after preview and affected line range WITHOUT writing. Default false.' },
          use_regex: { type: 'boolean', description: 'If true, treat search as a regular expression (g flag auto-added) and support $1/$2 capture groups in replace. Default false.' }
        },
        required: ['entityId', 'search', 'replace']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'append_note_content',
      description: `Append content to the end (or beginning) of a note WITHOUT providing a search string.
Use this for wholesale additions — a new section, a new paragraph — as opposed to patch_note_content which rewrites existing text.

Parameters:
- entityId: ID of the note entity (required)
- content: The Markdown text to append (required)
- position: "end" (default, append to the end) | "start" (insert at the very top)

Returns: { id, title, position, appended_chars, affected_line_range, total_lines_after, _diff }.`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the note entity' },
          content: { type: 'string', description: 'The Markdown text to append.' },
          position: { type: 'string', enum: ['end', 'start'], description: 'Where to add the content. "end" (default) appends to the end; "start" inserts at the top.' }
        },
        required: ['entityId', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_note_section',
      description: `Delete a whole section from a note by line range OR by heading text — no need to match the exact text of the section.

Two modes (provide exactly one):
- range: { start_line, end_line? } — delete the 1-indexed inclusive line range (end_line omitted = to end of note). Line numbers come from get_note_lines / get_note_outline.
- heading: the heading text (WITHOUT the leading #). Deletes the heading line itself plus everything up to (but not including) the next heading of the same or higher level, or the end of the note. The heading text must be unique; if it appears multiple times the tool refuses and lists all matches.

Parameters:
- entityId: ID of the note entity (required)
- range: { start_line, end_line? } (optional, mutually exclusive with heading)
- heading: heading text without leading # (optional, mutually exclusive with range)

Returns: { id, title, deleted_lines, affected_line_range, total_lines_after, _diff }.`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the note entity' },
          range: {
            type: 'object',
            description: '1-indexed inclusive line range to delete.',
            properties: {
              start_line: { type: 'number', description: 'First line to delete (1-indexed, inclusive)' },
              end_line: { type: 'number', description: 'Last line to delete (1-indexed, inclusive). Omit to delete to the end of the note.' }
            },
            required: ['start_line']
          },
          heading: { type: 'string', description: 'Heading text without the leading #. The heading line and its section body (up to the next same/higher-level heading) are deleted. Must be unique.' }
        },
        required: ['entityId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'insert_image_into_note',
      description: `Insert an image into a note using Markdown syntax (![alt](src)).

Use this whenever you have a relevant image to add to a note — from image_search (imageUrl), from read_url's "images" field, or from a user-uploaded chat attachment (referenced as "attachment:<id>").

Parameters:
- entityId: ID of the note entity (required)
- image_source: Either a full http(s) image URL, or "attachment:<id>" pointing to an uploaded image (required)
- alt_text: Alt text for the image (optional, default "Image")
- anchor_text: Exact text already in the note to insert the image right after (optional, must be verbatim and unique — same rule as patch_note_content). If omitted, the image is appended to the end of the note.

Returns: { id, title, _diff }. Throws if the note/attachment is not found, or if anchor_text is not found or is ambiguous (appears multiple times) — in that case re-read the note with get_entity_content and retry.`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the note entity' },
          image_source: { type: 'string', description: 'An http(s) image URL, or "attachment:<id>" for an uploaded image' },
          alt_text: { type: 'string', description: 'Alt text for the image (default "Image")' },
          anchor_text: { type: 'string', description: 'Exact, unique text in the note after which to insert the image. Omit to append at the end.' }
        },
        required: ['entityId', 'image_source']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_quiz',
      description: `Create a new quiz bank for a subject.

Critical: The quiz bank must contain an extensive set of questions.

Question Type Distribution:
- single_choice: ~40% (4-5 options)
- multiple_choice: ~20% (4-5 options)
- true_false: ~15%
- fill_in_blank: ~15%
- short_answer: ~10%

Content Format:
{
  "questions": [
    {
      "id": "q1",
      "type": "single_choice",
      "text": "Question content (Markdown supported)",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": "0",  // Index for choice (0-based)
      "explanation": "Detailed explanation..."
    },
    ...
  ]
}

Important Notes:
- answer field: Use index for choices, "true" or "false" for True/False.
- Every question must have an explanation.
- Content must be clear and accurate.
- Maintain a balance of difficulty levels.

Parameters:
- subjectId: ID of the subject (required)
- title: Title of the quiz bank (required)
- content: Object containing a questions array (required, should be a large set of questions)`,
      parameters: {
        type: 'object',
        properties: {
          subjectId: { type: 'string', description: 'The ID of the subject' },
          title: { type: 'string', description: 'Title of the quiz bank' },
          content: { 
            type: 'object', 
            description: 'Quiz content containing an array of questions. Should be a comprehensive set of questions.',
            properties: {
              questions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    type: { type: 'string', enum: ['single_choice', 'multiple_choice', 'fill_in_blank', 'true_false', 'short_answer', 'essay'] },
                    text: { type: 'string', description: 'The question text (supports Markdown)' },
                    options: { type: 'array', items: { type: 'string' }, description: 'Options for choice questions' },
                    answer: { type: 'string', description: 'Correct answer. Index for choices, "true"/"false" for true_false, or the actual answer string.' },
                    explanation: { type: 'string', description: 'Detailed explanation for the answer' }
                  },
                  required: ['id', 'type', 'text', 'answer']
                }
              }
            },
            required: ['questions']
          }
        },
        required: ['subjectId', 'title', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_quiz',
      description: `Completely replace an existing quiz bank's content or title.
Use this only when regenerating the majority of the questions.
For adding, fixing, or deleting a few questions, prefer patch_quiz_questions instead.`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the quiz entity' },
          title: { type: 'string', description: 'New title' },
          content: {
            type: 'object',
            description: 'Quiz content containing an array of questions.',
            properties: {
              questions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    type: { type: 'string', enum: ['single_choice', 'multiple_choice', 'fill_in_blank', 'true_false', 'short_answer', 'essay'] },
                    text: { type: 'string', description: 'The question text' },
                    options: { type: 'array', items: { type: 'string' }, description: 'Options for choice questions' },
                    answer: { type: 'string', description: 'Correct answer. Index for choices, "true"/"false" for true_false, or the actual answer string.' },
                    explanation: { type: 'string', description: 'Explanation for the answer' }
                  },
                  required: ['id', 'type', 'text', 'answer']
                }
              }
            },
            required: ['questions']
          }
        },
        required: ['entityId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'patch_quiz_questions',
      description: `Add, update, or delete individual questions in an existing quiz bank without rewriting the entire bank.
Use this tool for targeted changes — fixing a wrong answer, adding a few new questions, removing outdated ones.

**Strongly preferred over update_quiz** whenever:
- Only a small number of questions need to change
- You want to append new questions to an existing bank
- You have already identified the target question IDs via get_quiz_questions

Each operation in the list specifies:
- type: "add" | "update" | "delete"
- question_id: required for "update" and "delete" — the id field of the target question
- question: required for "add" (full question object); for "update" only the fields to merge

Multiple operations can be batched in a single call.`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the quiz entity' },
          operations: {
            type: 'array',
            description: 'List of add/update/delete operations to perform on questions.',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['add', 'update', 'delete'], description: 'Operation type' },
                question_id: { type: 'string', description: 'ID of the question to update or delete' },
                question: {
                  type: 'object',
                  description: 'For "add": complete question object. For "update": fields to merge into the existing question.',
                  properties: {
                    id: { type: 'string' },
                    type: { type: 'string', enum: ['single_choice', 'multiple_choice', 'fill_in_blank', 'true_false', 'short_answer', 'essay'] },
                    text: { type: 'string' },
                    options: { type: 'array', items: { type: 'string' } },
                    answer: { type: 'string' },
                    explanation: { type: 'string' }
                  }
                }
              },
              required: ['type']
            }
          }
        },
        required: ['entityId', 'operations']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_taskboard',
      description: `Create a new taskboard for a subject.

Task Node Format (type MUST be "taskBlock"):
{
  "nodes": [
    { 
      "id": "block1", 
      "type": "taskBlock", 
      "data": { 
        "title": "Phase 1: Preparation",
        "items": [
          { "id": "t1", "text": "Install required tools", "completed": false },
          { "id": "t2", "text": "Set up workspace", "completed": false }
        ]
      }, 
      "position": { "x": 100, "y": 100 } 
    }
  ],
  "edges": []
}

Parameters:
- subjectId: ID of the subject (required)
- title: Title of the taskboard (required)
- content: Object containing nodes (type: "taskBlock") and edges (required, should include multiple blocks with many items)`,
      parameters: {
        type: 'object',
        properties: {
          subjectId: { type: 'string', description: 'The ID of the subject' },
          title: { type: 'string', description: 'Title of the taskboard' },
          content: { 
            type: 'object', 
            description: 'Taskboard content containing nodes (type: "taskBlock") and edges. Each node data.items MUST be an array of objects: {id, text, completed}.',
            properties: {
              nodes: { 
                type: 'array', 
                items: { 
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    type: { type: 'string', enum: ['taskBlock'] },
                    data: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                        items: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              text: { type: 'string' },
                              completed: { type: 'boolean' }
                            },
                            required: ['id', 'text', 'completed']
                          }
                        }
                      },
                      required: ['title', 'items']
                    },
                    position: { type: 'object' }
                  },
                  required: ['id', 'type', 'data', 'position']
                }
              },
              edges: { type: 'array', items: { type: 'object' } }
            }
          }
        },
        required: ['subjectId', 'title', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_taskboard',
      description: `Update an existing taskboard.
Modify the title or update task nodes.
Maintain a substantial number of tasks when updating.`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the taskboard entity' },
          title: { type: 'string', description: 'New title' },
          content: { 
            type: 'object', 
            description: 'Taskboard content containing nodes (type: "taskBlock") and edges. Each node data.items MUST be an array of objects: {id, text, completed}.',
            properties: {
              nodes: { 
                type: 'array', 
                items: { 
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    type: { type: 'string', enum: ['taskBlock'] },
                    data: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                        items: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              text: { type: 'string' },
                              completed: { type: 'boolean' }
                            },
                            required: ['id', 'text', 'completed']
                          }
                        }
                      },
                      required: ['title', 'items']
                    },
                    position: { type: 'object' }
                  },
                  required: ['id', 'type', 'data', 'position']
                }
              },
              edges: { type: 'array', items: { type: 'object' } }
            }
          }
        },
        required: ['entityId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'present_plan',
      description: `Use this tool when you have finished the planning phase and want to present the plan to the user for confirmation. 
This tool signals that you are waiting for user input before proceeding to call any data modification tools.`,
      parameters: {
        type: 'object',
        properties: {
          plan_summary: { type: 'string', description: 'A brief summary of what you plan to accomplish.' }
        },
        required: ['plan_summary']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'start_execution',
      description: `Use this tool ONLY after the user has confirmed your plan (e.g., when they say "Confirm", "OK", "Start"). 
This tool formally switches your internal mode from PLANNING to EXECUTION. 
Call this tool as the very first step of your execution phase.`,
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delegate_task',
      description: DELEGATE_TASK_DESCRIPTION,
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: '自包含的子任务描述：目标、约束、内容规格（如题目数量/题型、笔记大纲、导图层级）。子 Agent 看不到对话历史，必须在此写全。'
          },
          context: {
            type: 'string',
            description: '可选上下文，通常是实体 ID。例如 "subjectId: s1" 或 "entityId: e2"。子 Agent 据此操作具体实体。'
          }
        },
        required: ['task']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_note_outline',
      description: `Extract the Markdown heading outline from a note. Returns all headings (# through ###) with their line numbers.
Use this tool to:
- Quickly locate sections in a long note without reading the full content
- Identify which line ranges to target with get_note_lines for detailed reading
- Orient yourself in research cache notes or large documents

Parameters:
- entityId: ID of the note entity (required)
- max_depth: Maximum heading depth to include, defaults to 3 (optional)

Returns: The note title, total line count, and an ordered array of {level, text, line} for each heading.`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the note entity' },
          max_depth: { type: 'number', description: 'Maximum heading depth (1-6), defaults to 3' }
        },
        required: ['entityId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_in_note',
      description: `Full-text search INSIDE a single note — the "content → location" counterpart to get_note_lines ("location → content").
Use this to find where a term/phrase occurs (line + column) before editing, or to check whether something already exists in a long note.

Parameters:
- entityId: ID of the note entity (required)
- query: The text to find, or a regex source when use_regex=true (required)
- case_sensitive: Match case-sensitively? Default false (case-insensitive).
- use_regex: Treat query as a regular expression? Default false.
- max_results: Cap on returned matches (default 50, max 500). total_matches is always the full count; truncated=true if capped.

Returns: { total_matches, returned, truncated, matches: [{ line, column, length, preview }] }.`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the note entity' },
          query: { type: 'string', description: 'The text to search for (or regex source when use_regex=true).' },
          case_sensitive: { type: 'boolean', description: 'Match case-sensitively. Default false (case-insensitive).' },
          use_regex: { type: 'boolean', description: 'Treat query as a regular expression. Default false.' },
          max_results: { type: 'number', description: 'Maximum matches to return (default 50, max 500).' }
        },
        required: ['entityId', 'query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_note_stats',
      description: `Return summary statistics for a note WITHOUT reading its full content: total lines, character count, CJK chars and word count, headings by level, table count, code blocks by language, image count, link count, and estimated reading time.
Use this to quickly gauge a note's size/structure before deciding how to read or edit it.

Parameters:
- entityId: ID of the note entity (required)

Returns: { total_lines, char_count, cjk_chars, word_count, headings:{total,by_level}, tables, code_blocks, images, links, estimated_reading_minutes }.`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the note entity' }
        },
        required: ['entityId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_entity',
      description: `Delete an entity (note, quiz, mindmap, or taskboard) permanently.
Use this tool to:
- Clean up cache notes after consolidating research findings
- Remove unwanted or duplicate content
- Tidy up the workspace after a research session

WARNING: This is irreversible. Always ask the user before deleting content they created. Cache notes created by sub-agents during research may be deleted without asking.

Parameters:
- entityId: ID of the entity to delete (required)

Returns: Confirmation with the deleted entity's title.`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the entity to delete' }
        },
        required: ['entityId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_task_list',
      description: `Update the research task list visible to the user. This tracks progress through multi-phase research.
Use this tool to:
- Define the initial task breakdown at the start of research
- Mark tasks as in_progress when you begin working on them
- Mark tasks as completed when finished
- Add new tasks discovered during research

The task list is displayed as a visual progress card in the chat UI.

Parameters:
- items: Array of task items, each with:
  - id: Unique identifier string (e.g. "s1", "s2")
  - text: Task description in Chinese
  - status: "pending", "in_progress", or "completed"`,
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: 'Complete task list with updated statuses',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Unique task identifier' },
                text: { type: 'string', description: 'Task description' },
                status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: 'Current task status' }
              },
              required: ['id', 'text', 'status']
            }
          }
        },
        required: ['items']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description: `Ask the user a question to clarify requirements, confirm direction, or resolve ambiguity.
Use this tool when:
- The research scope is ambiguous and you need clarification
- You need to confirm a design choice before proceeding
- You want the user to select from multiple valid approaches
- You need additional details to improve research quality
- Asking which research files to keep at the end of research (NEVER delete files before asking)

The question is displayed as an interactive card in the chat UI. The user's answer will be returned as this tool's result.

IMPORTANT: The UI ALWAYS provides a manual free-text input alongside whatever preset options you supply. You therefore never need to enumerate every conceivable answer — provide a few sensible presets (e.g. keep-all / delete-caches / report-only) and the user can type a custom answer for anything else.

Parameters:
- question: The question to ask the user, in Chinese (required)
- type: "single" (single choice from options), "multi" (multiple choices), or "text" (free text input)
- options: Array of option strings (required for "single" and "multi" types, omit for "text"). Keep it short (2-4 presets); manual input covers the rest.`,
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The question to ask the user, in Chinese' },
          type: { type: 'string', enum: ['single', 'multi', 'text'], description: 'Type of question: single choice, multiple choice, or free text' },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of options (required for single/multi type)'
          }
        },
        required: ['question', 'type']
      }
    }
  }
];
