{{- define "agency-os.controlPlaneService" -}}
{{- if .Values.serviceName }}{{ .Values.serviceName }}{{ else }}control-plane{{ end -}}
{{- end -}}

{{- define "agency-os.fullname" -}}
{{- default (printf "%s-%s" .Release.Name "agency-os") .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "agency-os.controlPlaneSelector" -}}
app.kubernetes.io/name: {{ include "agency-os.fullname" . }}
app.kubernetes.io/component: control-plane
{{- end -}}

{{- define "agency-os.dashboardSelector" -}}
app.kubernetes.io/name: {{ include "agency-os.fullname" . }}
app.kubernetes.io/component: dashboard
{{- end -}}

{{- define "agency-os.pgSecretRef" -}}
{{- if .Values.postgresql.existingSecret }}{{ .Values.postgresql.existingSecret }}{{ else }}{{ include "agency-os.fullname" . }}-postgresql{{ end -}}
{{- end -}}

{{- define "agency-os.secretRef" -}}
{{- if .Values.controlPlane.existingSecret }}{{ .Values.controlPlane.existingSecret }}{{ else }}{{ include "agency-os.fullname" . }}{{ end -}}
{{- end -}}

{{- define "agency-os.labels" -}}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: helm
app.kubernetes.io/part-of: agency-os
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end -}}