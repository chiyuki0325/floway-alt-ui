import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { Trans, useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { z } from "zod";

import { fluentComponents } from "../fluent";
import { FlowayLogo } from "./floway-logo";
import styles from "./login-form.module.css";

const {
  Button,
  Card,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Spinner,
} = fluentComponents;

const loginSchema = z.object({
  username: z
    .string()
    .regex(/^[a-zA-Z0-9_.-]{0,64}$/, "validation.usernamePattern"),
  password: z
    .string()
    .min(1, "validation.passwordRequired")
    .max(1024, "validation.passwordMax"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export interface LoginActionData {
  ok: false;
  values: Pick<LoginFormValues, "username">;
  error: string;
}

export function LoginForm() {
  const { t } = useTranslation();
  const fetcher = useFetcher<LoginActionData>();
  const isSubmitting = fetcher.state !== "idle";

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  useEffect(() => {
    if (fetcher.data?.ok === false) {
      setError("password", { type: "server", message: fetcher.data.error });
    }
  }, [fetcher.data, setError]);

  const onSubmit = (values: LoginFormValues) => {
    void fetcher.submit(
      {
        username: values.username.trim(),
        password: values.password,
      },
      { method: "post" },
    );
  };

  const passwordError = errors.password?.message;
  const usernameError = errors.username?.message;
  const serverError =
    fetcher.data?.ok === false ? fetcher.data.error : undefined;

  return (
    <div className={styles.login}>
      <Card className={styles.card}>
        <div className={styles.inner}>
          <header className={styles.header}>
            <FlowayLogo className={styles.logo} />
            <div className={styles.heading}>
              <h1>{t("auth.login.title")}</h1>
              <p>{t("auth.login.subtitle")}</p>
            </div>
          </header>

          <form className={styles.form} onSubmit={handleSubmit(onSubmit)}>
            <Controller
              control={control}
              name="username"
              render={({ field }) => (
                <Field
                  validationMessage={usernameError ? t(usernameError) : undefined}
                  validationState={usernameError ? "error" : undefined}
                >
                  <Input
                    {...field}
                    aria-label={t("auth.login.username")}
                    autoComplete="username"
                    autoFocus
                    disabled={isSubmitting}
                    placeholder={t("auth.login.usernamePlaceholder")}
                    size="small"
                  />
                </Field>
              )}
            />

            <Controller
              control={control}
              name="password"
              render={({ field }) => (
                <Field
                  validationMessage={passwordError ? t(passwordError) : undefined}
                  validationState={passwordError ? "error" : undefined}
                >
                  <Input
                    {...field}
                    aria-label={t("auth.login.password")}
                    autoComplete="current-password"
                    disabled={isSubmitting}
                    placeholder={t("auth.login.passwordPlaceholder")}
                    size="small"
                    type="password"
                  />
                </Field>
              )}
            />

            <Button
              appearance="primary"
            className={styles.submit}
            disabled={isSubmitting}
            type="submit"
          >
              {isSubmitting ? (
                <span className={styles.pending}>
                  <Spinner size="tiny" />
                  {t("auth.login.submitting")}
                </span>
              ) : (
                t("auth.login.submit")
              )}
            </Button>

            <p className={styles.hint}>
              <Trans
                i18nKey="auth.adminKeyHint"
                components={{
                  adminKey: <code className={styles.inlineCode} />,
                }}
              />
            </p>
          </form>

          {serverError && (
            <MessageBar intent="error" className={styles.message}>
              <MessageBarBody>{t(serverError)}</MessageBarBody>
            </MessageBar>
          )}
        </div>
      </Card>
    </div>
  );
}
