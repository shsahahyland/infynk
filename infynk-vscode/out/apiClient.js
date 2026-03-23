"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.askQuestion = askQuestion;
exports.triggerIngest = triggerIngest;
exports.getHealth = getHealth;
exports.getGraphStats = getGraphStats;
const vscode = __importStar(require("vscode"));
function getBaseUrl() {
    return vscode.workspace
        .getConfiguration('infynk')
        .get('backendUrl', 'http://localhost:8000');
}
async function post(path, body) {
    const response = await fetch(`${getBaseUrl()}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`infynk API error ${response.status}: ${response.statusText}`);
    }
    return response.json();
}
async function get(path) {
    const response = await fetch(`${getBaseUrl()}${path}`);
    if (!response.ok) {
        throw new Error(`infynk API error ${response.status}: ${response.statusText}`);
    }
    return response.json();
}
function askQuestion(request) {
    return post('/ask', request);
}
function triggerIngest() {
    return post('/ingest', {});
}
function getHealth() {
    return get('/health');
}
function getGraphStats() {
    return get('/graph/stats');
}
//# sourceMappingURL=apiClient.js.map