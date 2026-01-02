/**
 * DataGrid Export Utilities
 * Functions for exporting grid data to CSV, Excel, and PDF formats
 */

import type { ColumnDef } from './types';
import { getCellValue } from './utils';

/**
 * Export options
 */
export interface ExportOptions {
  /** Filename without extension */
  filename?: string;
  /** Include headers in export */
  includeHeaders?: boolean;
  /** Columns to include (by id). If not provided, all visible columns are included */
  columns?: string[];
  /** Custom date format */
  dateFormat?: string;
}

/**
 * Format a value for export
 */
function formatExportValue(value: unknown): string {
  if (value == null) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * Escape a value for CSV (handle commas, quotes, newlines)
 */
function escapeCSVValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Export data to CSV format
 */
export function exportToCSV<T>(
  data: T[],
  columns: ColumnDef<T>[],
  options: ExportOptions = {}
): string {
  const {
    includeHeaders = true,
    columns: columnIds,
  } = options;

  // Filter columns if specified
  const exportColumns = columnIds
    ? columns.filter((col) => columnIds.includes(col.id))
    : columns.filter((col) => col.visible !== false);

  const rows: string[] = [];

  // Add header row
  if (includeHeaders) {
    const headerRow = exportColumns.map((col) => escapeCSVValue(col.header)).join(',');
    rows.push(headerRow);
  }

  // Add data rows
  for (const row of data) {
    const values = exportColumns.map((col) => {
      const value = getCellValue(row, col);
      return escapeCSVValue(formatExportValue(value));
    });
    rows.push(values.join(','));
  }

  return rows.join('\n');
}

/**
 * Export data to Excel XML format (simple spreadsheet XML)
 * This creates a basic Excel-compatible XML file
 */
export function exportToExcel<T>(
  data: T[],
  columns: ColumnDef<T>[],
  options: ExportOptions = {}
): string {
  const {
    includeHeaders = true,
    columns: columnIds,
  } = options;

  // Filter columns if specified
  const exportColumns = columnIds
    ? columns.filter((col) => columnIds.includes(col.id))
    : columns.filter((col) => col.visible !== false);

  // Build Excel XML
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<?mso-application progid="Excel.Sheet"?>\n';
  xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n';
  xml += '  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n';
  xml += '  <Worksheet ss:Name="Sheet1">\n';
  xml += '    <Table>\n';

  // Add header row
  if (includeHeaders) {
    xml += '      <Row>\n';
    for (const col of exportColumns) {
      xml += `        <Cell><Data ss:Type="String">${escapeXML(col.header)}</Data></Cell>\n`;
    }
    xml += '      </Row>\n';
  }

  // Add data rows
  for (const row of data) {
    xml += '      <Row>\n';
    for (const col of exportColumns) {
      const value = getCellValue(row, col);
      const formattedValue = formatExportValue(value);
      const type = typeof value === 'number' ? 'Number' : 'String';
      xml += `        <Cell><Data ss:Type="${type}">${escapeXML(formattedValue)}</Data></Cell>\n`;
    }
    xml += '      </Row>\n';
  }

  xml += '    </Table>\n';
  xml += '  </Worksheet>\n';
  xml += '</Workbook>';

  return xml;
}

/**
 * Escape XML special characters
 */
function escapeXML(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Export data to PDF format (generates HTML that can be printed to PDF)
 * Returns HTML string that can be opened in a new window and printed
 */
export function exportToPDF<T>(
  data: T[],
  columns: ColumnDef<T>[],
  options: ExportOptions = {}
): string {
  const {
    filename = 'export',
    includeHeaders = true,
    columns: columnIds,
  } = options;

  // Filter columns if specified
  const exportColumns = columnIds
    ? columns.filter((col) => columnIds.includes(col.id))
    : columns.filter((col) => col.visible !== false);

  // Build HTML for PDF
  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeXML(filename)}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      font-size: 12px;
      margin: 20px;
    }
    h1 {
      font-size: 18px;
      margin-bottom: 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    th {
      background-color: #f5f5f5;
      font-weight: bold;
    }
    tr:nth-child(even) {
      background-color: #fafafa;
    }
    .footer {
      font-size: 10px;
      color: #666;
      margin-top: 20px;
    }
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <h1>${escapeXML(filename)}</h1>
  <table>`;

  // Add header row
  if (includeHeaders) {
    html += '\n    <thead>\n      <tr>';
    for (const col of exportColumns) {
      html += `\n        <th>${escapeXML(col.header)}</th>`;
    }
    html += '\n      </tr>\n    </thead>';
  }

  // Add data rows
  html += '\n    <tbody>';
  for (const row of data) {
    html += '\n      <tr>';
    for (const col of exportColumns) {
      const value = getCellValue(row, col);
      const formattedValue = formatExportValue(value);
      html += `\n        <td>${escapeXML(formattedValue)}</td>`;
    }
    html += '\n      </tr>';
  }
  html += '\n    </tbody>';

  html += `
  </table>
  <div class="footer">
    Generated on ${new Date().toLocaleString()} | Total rows: ${data.length}
  </div>
  <div class="no-print" style="margin-top: 20px;">
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
</body>
</html>`;

  return html;
}

/**
 * Download a file with the given content
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Open content in a new window (for PDF printing)
 */
export function openInNewWindow(content: string): void {
  const newWindow = window.open('', '_blank');
  if (newWindow) {
    newWindow.document.write(content);
    newWindow.document.close();
  }
}

/**
 * Export data to the specified format and trigger download
 */
export function exportData<T>(
  data: T[],
  columns: ColumnDef<T>[],
  format: 'csv' | 'excel' | 'pdf',
  options: ExportOptions = {}
): void {
  const filename = options.filename || `export-${new Date().toISOString().split('T')[0]}`;

  switch (format) {
    case 'csv': {
      const csv = exportToCSV(data, columns, options);
      downloadFile(csv, `${filename}.csv`, 'text/csv;charset=utf-8;');
      break;
    }
    case 'excel': {
      const excel = exportToExcel(data, columns, options);
      downloadFile(excel, `${filename}.xml`, 'application/vnd.ms-excel');
      break;
    }
    case 'pdf': {
      const pdf = exportToPDF(data, columns, { ...options, filename });
      openInNewWindow(pdf);
      break;
    }
  }
}
